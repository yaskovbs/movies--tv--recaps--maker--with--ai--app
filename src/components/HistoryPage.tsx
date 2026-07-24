import { useState, useEffect } from 'react'
import { RecapRecord } from '../lib/blink'
import { recapStorageService } from '../lib/recapStorage'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Trash2, Download, Play, Search, Filter, Film } from 'lucide-react'
import { Input } from './ui/input'

export default function HistoryPage() {
  const [recaps, setRecaps] = useState<RecapRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('all')

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

  const handleDelete = async (recapId: string) => {
    if (!confirm('Are you sure you want to delete this recap?')) return
    try {
      await recapStorageService.deleteRecap(recapId)
      setRecaps(recaps.filter(r => r.id !== recapId))
    } catch (error) {
      console.error('Failed to delete recap:', error)
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
    return <div className="p-8 text-center text-white">Loading your history...</div>
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Recap History</h1>
        
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recaps..."
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
                <option key={genre} value={genre}>{genre === 'all' ? 'All Genres' : genre}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredRecaps.length === 0 ? (
          <div className="text-center text-gray-400 py-12 glass rounded-xl">
            <p className="text-lg">No recaps found</p>
            <Button variant="link" onClick={() => window.location.href = '/'} className="text-blue-400">
              Create your first recap
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

                <div className="px-6 py-4 bg-black/10 border-t border-white/10 flex gap-2 justify-between items-center">
                  <div className="flex gap-2">
                    {recap.videoUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDownloadVideo(recap.videoUrl, recap.title)}
                        title="Download Video"
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
                          title="Play Audio"
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownloadAudio(recap.audioUrl, recap.title)}
                          title="Download Audio"
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
                    title="Delete"
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
