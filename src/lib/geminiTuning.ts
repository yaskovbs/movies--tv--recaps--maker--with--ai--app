import { supabase, ensureSession, isPermanentUser, TuningJobRecord, TuningJobRow, RecapRecord, tuningJobRowToRecord } from './supabase'

// Step 2 of "learning from usage": once a user has accumulated enough
// "up"-rated recaps (see recapStorage.ts / step 1's few-shot examples), this
// runs a real Gemini supervised fine-tuning job on that data via the
// Gemini API's tunedModels endpoint (the same generativelanguage.googleapis.com
// host used everywhere else in this app, authenticated with the user's own
// API key - no separate Google Cloud project/service account needed).
//
// IMPORTANT CAVEAT: Google's fine-tuning support has been shifting toward
// its Vertex AI / "Gemini Enterprise" platform, which requires a full GCP
// project and service-account auth incompatible with this app's "paste an
// API key" model. The plain API-key tunedModels endpoint used here may only
// support certain older/specific base models, may be restricted for some
// API keys, or could be discontinued - every step below is written to fail
// non-fatally and report a clear reason rather than break anything, exactly
// like the video/audio Gemini File API calls elsewhere in this file's sibling
// (HomePage.tsx).

export const MIN_EXAMPLES_FOR_TUNING = 15

export interface TuningExample {
  textInput: string
  output: string
}

function recapToTuningExample(recap: RecapRecord): TuningExample {
  const genreText = recap.genre ? ` (Genre: ${recap.genre})` : ''
  return {
    textInput: `Title: ${recap.title}${genreText}\n\nDescription: ${recap.description || ''}`,
    output: recap.scriptText,
  }
}

/**
 * Finds a base model this API key is allowed to tune, by asking Gemini which
 * models support createTunedModel - rather than hardcoding a model name that
 * may not exist or may not be enabled for a given key/project.
 */
async function findTunableBaseModel(apiKey: string): Promise<string | undefined> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  if (!response.ok) return undefined
  const data = await response.json()
  const models = (data.models || []) as Array<{ name: string; supportedGenerationMethods?: string[] }>
  const tunable = models.filter(m => m.supportedGenerationMethods?.includes('createTunedModel'))
  // Prefer a "flash" model (cheaper/faster) if one is tunable, otherwise take whatever is available.
  return (tunable.find(m => m.name.includes('flash')) || tunable[0])?.name
}

/**
 * Starts a fine-tuning job from this user's "up"-rated recaps and records it
 * in the database so its progress can be checked later. Throws with a clear
 * message on failure - callers should show that message, not silently retry.
 */
export async function startTuningJob(apiKey: string, examples: RecapRecord[]): Promise<TuningJobRecord> {
  // Training runs for minutes to hours, so unlike saving/rating recaps this
  // one specifically asks for a real signed-in account rather than the
  // automatic anonymous session, so the job can reliably be checked on later
  // even if this browser's local session is ever lost.
  const user = await ensureSession()
  if (!isPermanentUser(user)) {
    throw new Error('You need to be signed in to train a personalized model.')
  }
  if (examples.length < MIN_EXAMPLES_FOR_TUNING) {
    throw new Error(`Need at least ${MIN_EXAMPLES_FOR_TUNING} recaps rated "up" before training can start.`)
  }

  const baseModel = await findTunableBaseModel(apiKey)
  if (!baseModel) {
    throw new Error('This API key/project does not currently have any base model available for fine-tuning.')
  }

  const trainingExamples = examples.map(recapToTuningExample)

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/tunedModels?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: `recap-scripts-${Date.now()}`,
      baseModel,
      tuningTask: {
        trainingData: {
          examples: {
            examples: trainingExamples,
          },
        },
        hyperparameters: {
          epochCount: 5,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.error?.message || 'Gemini rejected the fine-tuning request.')
  }

  const operation = await response.json() as { name?: string }
  if (!operation.name) {
    throw new Error('Gemini did not return a tuning operation to track.')
  }

  const { data, error } = await supabase
    .from('tuning_jobs')
    .insert({
      user_id: user!.id,
      operation_name: operation.name,
      base_model: baseModel,
      example_count: examples.length,
      status: 'training',
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return tuningJobRowToRecord(data as TuningJobRow)
}

/** Fetches this user's most recent tuning job, if any. */
export async function getLatestTuningJob(): Promise<TuningJobRecord | null> {
  const user = await ensureSession()
  if (!isPermanentUser(user)) return null

  const { data, error } = await supabase
    .from('tuning_jobs')
    .select()
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  return tuningJobRowToRecord(data[0] as TuningJobRow)
}

/**
 * Polls a training job's status once and updates the stored record. Meant to
 * be called opportunistically (e.g. when History loads) rather than in a
 * tight loop - a real tuning job can take anywhere from minutes to hours.
 */
export async function refreshTuningJobStatus(job: TuningJobRecord, apiKey: string): Promise<TuningJobRecord> {
  if (job.status !== 'training') return job

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${job.operationName}?key=${apiKey}`)
    if (!response.ok) return job

    const operation = await response.json() as {
      done?: boolean
      error?: { message?: string }
      response?: { name?: string }
      metadata?: { tunedModel?: string }
    }
    if (!operation.done) return job

    if (operation.error) {
      return updateTuningJob(job.id, {
        status: 'failed',
        error_message: operation.error.message || 'Training failed for an unknown reason.',
      })
    }

    const tunedModelName = operation.response?.name || operation.metadata?.tunedModel
    if (!tunedModelName) {
      return updateTuningJob(job.id, {
        status: 'failed',
        error_message: 'Training finished but did not return a usable model.',
      })
    }

    return updateTuningJob(job.id, { status: 'ready', tuned_model_name: tunedModelName })
  } catch (error) {
    console.warn('Could not refresh tuning job status:', error)
    return job
  }
}

async function updateTuningJob(
  id: string,
  updates: Partial<Pick<TuningJobRow, 'status' | 'tuned_model_name' | 'error_message'>>
): Promise<TuningJobRecord> {
  const { data, error } = await supabase.from('tuning_jobs').update(updates).eq('id', id).select().single()
  if (error) {
    throw new Error(error.message)
  }
  return tuningJobRowToRecord(data as TuningJobRow)
}
