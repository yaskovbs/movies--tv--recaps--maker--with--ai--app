import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RecapRecord, TuningJobRecord } from '../lib/blink'
import { recapStorageService } from '../lib/recapStorage'
import { startTuningJob, getLatestTuningJob, refreshTuningJobStatus, MIN_EXAMPLES_FOR_TUNING } from '../lib/geminiTuning'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Trash2, Download, Play, Search, Filter, Film, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from 'lucide-react'
import { Input } from './ui/input'

interface HistoryPageProps {
  apiKey: string
}

export default function HistoryPage({ apiKey }: HistoryPageProps) {
  const { t } = useTranslation()
  const [recaps, setRecaps] = useState<RecapRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('all')

  const [tuningJob, setTuningJob] = useState<TuningJobRecord | null>(null)
  const [tuningLoading, setTuningLoading] = useState(false)
  const [tuningError, setTuningError] = useState('')

  useEffect(() => {
    const fetchRecaps = async () => {
      try {
        const list = await recapStorageService.getRecaps()
        setRecaps(list)
      } catch (error) {
        console.error('Failed to load recaps:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRecaps()
  }, [])

  // Step 2 of "learning from usage": check for an existing training job, and
  // if one is still running, poll it once (real tuning jobs can take minutes
  // to hours - this just checks in, it doesn't block on it).
  useEffect(() => {
    const loadTuningStatus = async () => {
      try {
        let job = await getLatestTuningJob()
        if (job?.status === 'training' && apiKey) {
          job = await refreshTuningJobStatus(job, apiKey)
        }
        setTuningJob(job)
      } catch (error) {
        console.warn('Could not load tuning job status:', error)
      }
    }
    loadTuningStatus()
  }, [apiKey])

  const upRatedRecaps = recaps.filter(r => r.rating === 'up')

  const handleStartTraining = async () => {
    if (!apiKey) {
      setTuningError(t('historyPage.tuning.apiKeyRequired'))
      return
    }
    setTuningLoading(true)
    setTuningError('')
    try {
      const job = await startTuningJob(apiKey, upRatedRecaps)
      setTuningJob(job)
    } catch (error) {
      setTuningError(error instanceof Error ? error.message : t('historyPage.tuning.startError'))
    } finally {
      setTuningLoading(false)
    }
  }

  const handleDelete = async (recapId: string) => {
    if (!confirm(t('historyPage.confirmDelete'))) return
    try {
      await recapStorageService.deleteRecap(recapId)
      setRecaps(recaps.filter(r => r.id !== recapId))
    } catch (error) {
      console.error('Failed to delete recap:', error)
    }
  }

  const handleRate = async (recapId: string, rating: 'up' | 'down') => {
    const previous = recaps.find(r => r.id === recapId)?.rating
    setRecaps(recaps.map(r => r.id === recapId ? { ...r, rating } : r))
    try {
      await recapStorageService.rateRecap(recapId, rating)
    } catch (error) {
      console.error('Failed to rate recap:', error)
      setRecaps(recaps.map(r => r.id === recapId ? { ...r, rating: previous } : r))
    }
  }

  const handleDownloadAudio = (audioUrl: string | undefined, title: string) => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `${title}.mp3`
    a.target = '_blank'
    a.click()
  }

  const handleDownloadVideo = (videoUrl: string | undefined, title: string) => {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    a.download = `${title}.mp4`
    a.target = '_blank'
    a.click()
  }

  const filteredRecaps = recaps.filter(recap => {
    const matchesSearch = recap.title.toLowerCase().includes(search.toLowerCase()) || 
                         (recap.description?.toLowerCase().includes(search.toLowerCase()))
    const matchesGenre = genreFilter === 'all' || recap.genre === genreFilter
    return matchesSearch && matchesGenre
  })

  const uniqueGenres = ['all', ...new Set(recaps.map(r => r.genre).filter(Boolean))]

  if (loading) {
    return <div className="p-8 text-center text-white">{t('historyPage.loading')}</div>
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">{t('historyPage.title')}</h1>

        <Card className="glass rounded-xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">{t('historyPage.tuning.title')}</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">{t('historyPage.tuning.description')}</p>

          {tuningError && (
            <p className="text-sm text-red-300 mb-3">{tuningError}</p>
          )}

          {!tuningJob || tuningJob.status === 'failed' ? (
            <>
              {tuningJob?.status === 'failed' && (
                <p className="text-sm text-red-300 mb-3">
                  {t('historyPage.tuning.failed')}{tuningJob.errorMessage ? `: ${tuningJob.errorMessage}` : ''}
                </p>
              )}
              <p className="text-sm text-gray-300 mb-3">
                {t('historyPage.tuning.progress', { count: upRatedRecaps.length, min: MIN_EXAMPLES_FOR_TUNING })}
              </p>
              <Button
                onClick={handleStartTraining}
                disabled={tuningLoading || upRatedRecaps.length < MIN_EXAMPLES_FOR_TUNING}
              >
                {tuningLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('historyPage.tuning.startButton')}
              </Button>
            </>
          ) : tuningJob.status === 'training' ? (
            <p className="text-sm text-blue-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('historyPage.tuning.training')}
            </p>
          ) : (
            <p className="text-sm text-green-300">{t('historyPage.tuning.ready')}</p>
          )}
        </Card>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('historyPage.searchPlaceholder')}
              className="pl-10 glass-input text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400 w-4 h-4" />
            <select 
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="glass-input text-white rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {uniqueGenres.map(genre => (
                <option key={genre} value={genre}>{genre === 'all' ? t('historyPage.allGenres') : genre}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredRecaps.length === 0 ? (
          <div className="text-center text-gray-400 py-12 glass rounded-xl">
            <p className="text-lg">{t('historyPage.noRecapsFound')}</p>
            <Button variant="link" onClick={() => window.location.href = '/'} className="text-blue-400">
              {t('historyPage.createFirst')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredRecaps.map((recap) => (
              <Card key={recap.id} className="glass overflow-hidden flex flex-col">
                {recap.videoUrl && (
                  <video
                    src={recap.videoUrl}
                    controls
                    className="w-full aspect-video bg-black"
                  />
                )}
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1">{recap.title}</h2>
                      <div className="flex gap-2 items-center">
                        {recap.genre && (
                          <span className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded-full border border-blue-800/50">
                            {recap.genre}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {new Date(recap.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {recap.description && (
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">{recap.description}</p>
                  )}

                  <div className="bg-black/20 backdrop-blur-sm rounded-lg p-4 mb-4 border border-white/10">
                    <p className="text-sm text-gray-300 line-clamp-3 italic">"{recap.scriptText}"</p>
                  </div>
                </div>

                <div className="px-6 py-4 bg-black/10 border-t border-white/10 flex gap-2 justify-between items-center flex-wrap">
                  <div className="flex gap-2 items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRate(recap.id, 'up')}
                      title={t('historyPage.rateGoodHint')}
                      className={`hover:bg-green-900/20 ${recap.rating === 'up' ? 'text-green-400 bg-green-900/20' : 'text-gray-400 hover:text-green-300'}`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRate(recap.id, 'down')}
                      title={t('historyPage.rateBad')}
                      className={`hover:bg-red-900/20 ${recap.rating === 'down' ? 'text-red-400 bg-red-900/20' : 'text-gray-400 hover:text-red-300'}`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </Button>
                    {recap.videoUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownloadVideo(recap.videoUrl, recap.title)}
                        title={t('historyPage.downloadVideo')}
                        className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/20"
                      >
                        <Film className="w-4 h-4" />
                      </Button>
                    )}
                    {recap.audioUrl && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const audio = new Audio(recap.audioUrl)
                            audio.play()
                          }}
                          title={t('historyPage.playAudio')}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownloadAudio(recap.audioUrl, recap.title)}
                          title={t('historyPage.downloadAudio')}
                          className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(recap.id)}
                    title={t('historyPage.delete')}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
