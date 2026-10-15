'use client';

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import styles from './page.module.css';

// Dynamically import the VideoPlayer component with SSR disabled
const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), {
  ssr: false,
  loading: () => (
    <div className={`${styles.playerPlaceholder} glass`}>
      <div className={styles.spinner}></div>
      <p>Initializing secure player environment...</p>
    </div>
  ),
});

interface VideoItem {
  id: string;
  title: string;
  duration: number;
  tvgName?: string;
  groupTitle?: string;
  tvgLogo?: string;
  description?: string;
  manifestType?: string;
  licenseType?: string;
  licenseKey?: string;
  mimetype?: string;
  url: string;
  isUploaded?: boolean;
  uploadSource?: string;
}

function DashboardContent() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Playlist Type (TV / Series / Movies)
  const [playlistType, setPlaylistType] = useState<'tv' | 'series' | 'movies'>('tv');
  
  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Selection & Filters
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // View Mode: 'grid' vs 'list'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Items per page: 10, 100, 1000, or 'all' (1k in single)
  const [pageSize, setPageSize] = useState<number | 'all'>(10);

  // URL Query Parameters Navigation
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Pagination from URL query parameter
  const pageParam = searchParams.get('page');
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;

  // Restore user preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('drm_view_mode');
      if (savedMode === 'grid' || savedMode === 'list') {
        setViewMode(savedMode);
      }
      const savedSize = localStorage.getItem('drm_page_size');
      if (savedSize) {
        setPageSize(savedSize === 'all' ? 'all' : parseInt(savedSize, 10));
      }
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('drm_view_mode', mode);
    }
  };

  const handlePageSizeChange = (size: string) => {
    const newSize = size === 'all' ? 'all' : parseInt(size, 10);
    setPageSize(newSize);
    if (typeof window !== 'undefined') {
      localStorage.setItem('drm_page_size', size);
    }
    // Reset to page 1
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const fetchVideos = useCallback((typeToFetch = playlistType) => {
    setLoading(true);
    setError(null);
    fetch(`/api/videos?type=${typeToFetch}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load playlist data');
        return res.json();
      })
      .then((data) => {
        setVideos(data.videos || []);
        // Requirement: Do not autoplay anything on page load or category switch
        setSelectedVideo(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'An error occurred loading the videos.');
        setLoading(false);
      });
  }, [playlistType]);

  useEffect(() => {
    fetchVideos(playlistType);
  }, [playlistType, fetchVideos]);

  const handleUploadSuccess = (targetType: 'tv' | 'series' | 'movies') => {
    if (playlistType === targetType) {
      fetchVideos(targetType);
    } else {
      handlePlaylistTypeChange(targetType);
    }
  };

  const handlePlaylistTypeChange = (type: 'tv' | 'series' | 'movies') => {
    setPlaylistType(type);
    setSelectedCategory('All');
    setSearchQuery('');
    setSelectedVideo(null); // Ensure no autoplay
    
    // Clear URL page parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Format seconds or minutes to human-readable hours and minutes
  const formatDuration = (val: number) => {
    if (!val) return '';
    // If playlist is movies and val < 600, duration is in minutes
    const totalSeconds = (playlistType === 'movies' && val < 600) ? val * 60 : val;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Get unique categories and their counts
  const categories = ['All', ...Array.from(new Set(videos.map((v) => v.groupTitle).filter(Boolean) as string[]))];
  
  const getCategoryCount = (cat: string) => {
    if (cat === 'All') return videos.length;
    return videos.filter((v) => v.groupTitle === cat).length;
  };

  // Filtered videos based on category and search query
  const filteredVideos = videos.filter((video) => {
    const matchesCategory = selectedCategory === 'All' || video.groupTitle === selectedCategory;
    const matchesSearch = 
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (video.description && video.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (video.groupTitle && video.groupTitle.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Paginated videos calculation based on pageSize (10, 100, 1000, or 'all')
  const itemsPerPageNumber = pageSize === 'all' ? Math.max(1, filteredVideos.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / itemsPerPageNumber));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = pageSize === 'all' ? 0 : (effectivePage - 1) * itemsPerPageNumber;
  const paginatedVideos = pageSize === 'all' ? filteredVideos : filteredVideos.slice(startIndex, startIndex + itemsPerPageNumber);

  const handleVideoSelect = (video: VideoItem) => {
    setSelectedVideo(video);
    // Scroll to player smooth on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={styles.appContainer}>
      {/* Top Banner Navigation */}
      <header className={`${styles.header} glass`}>
        <div className={styles.logoArea}>
          <div className={styles.logoGlow}></div>
          <span className={styles.logoIcon}>✦</span>
          <h1 className={styles.logoText}>DRM Stream <span className={styles.gradientText}>Nexus</span></h1>
        </div>

        {/* Playlist Type Switcher Menu */}
        <nav className={styles.playlistTypeMenu}>
          <button
            onClick={() => handlePlaylistTypeChange('tv')}
            className={`${styles.typeButton} ${playlistType === 'tv' ? styles.typeButtonActive : ''}`}
          >
            <span className={styles.typeIcon}>📺</span> TV
          </button>
          <button
            onClick={() => handlePlaylistTypeChange('series')}
            className={`${styles.typeButton} ${playlistType === 'series' ? styles.typeButtonActive : ''}`}
          >
            <span className={styles.typeIcon}>🎬</span> Series
          </button>
          <button
            onClick={() => handlePlaylistTypeChange('movies')}
            className={`${styles.typeButton} ${playlistType === 'movies' ? styles.typeButtonActive : ''}`}
          >
            <span className={styles.typeIcon}>🎥</span> Movies
          </button>
        </nav>

        {/* Header Right Actions */}
        <div className={styles.headerRightActions}>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className={styles.uploadHeaderButton}
            title="Upload M3U8 Playlists"
          >
            <span className={styles.uploadHeaderIcon}>⬆</span>
            <span className={styles.uploadHeaderText}>Upload M3U8</span>
          </button>

          <div className={styles.statusIndicator}>
            <span className={styles.statusDot}></span>
            <span className={styles.statusText}>Backend Playlist Active</span>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className={styles.mainWorkspace}>
        {loading ? (
          <div className={styles.loadingScreen}>
            <div className={styles.spinner}></div>
            <p>Parsing playlist & loading channels...</p>
          </div>
        ) : error ? (
          <div className={`${styles.errorScreen} glass`}>
            <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2>Loading Failed</h2>
            <p>{error}</p>
          </div>
        ) : (
          <div className={styles.contentLayout}>
            {/* Video Player Section - Placed on Top on Mobile via CSS order / DOM */}
            <div className={styles.playerWrapper}>
              {selectedVideo ? (
                <div className={styles.playerContainer}>
                  <VideoPlayer
                    key={selectedVideo.id} // Re-mount when selected video changes
                    url={selectedVideo.url}
                    title={selectedVideo.title}
                    description={selectedVideo.description}
                    licenseKey={selectedVideo.licenseKey}
                    licenseType={selectedVideo.licenseType}
                    onStop={() => setSelectedVideo(null)}
                  />
                </div>
              ) : (
                <div className={`${styles.emptyPlayer} glass`}>
                  <div className={styles.emptyIcon}>🎬</div>
                  <h2>No Stream Selected</h2>
                  <p>Choose a stream from the list below to begin high-quality encrypted playback.</p>
                </div>
              )}
            </div>

            {/* Sidebar Filters */}
            <aside className={styles.sidebar}>
              <div className={`${styles.searchWrapper} glass`}>
                <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search streams or lessons..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={`${styles.filterCard} glass`}>
                <div className={styles.filterCardHeader}>
                  <h3 className={styles.filterTitle}>Categories</h3>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className={styles.sidebarUploadBtn}
                    title="Upload M3U8 to this category"
                  >
                    + Add M3U8
                  </button>
                </div>

                {/* Mobile Category Dropdown (Shown on mobile view) */}
                <div className={styles.mobileCategoryWrapper}>
                  <label htmlFor="mobile-cat-select" className={styles.mobileCategoryLabel}>
                    Select Category:
                  </label>
                  <div className={styles.mobileCategorySelectContainer}>
                    <select
                      id="mobile-cat-select"
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className={styles.mobileCategorySelect}
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat} ({getCategoryCount(cat)})
                        </option>
                      ))}
                    </select>
                    <span className={styles.selectChevron}>▼</span>
                  </div>
                </div>

                {/* Desktop Category Buttons List (Shown on desktop view) */}
                <div className={styles.categoryList}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      className={`${styles.categoryButton} ${selectedCategory === cat ? styles.categoryActive : ''}`}
                    >
                      <span className={styles.categoryName}>{cat}</span>
                      <span className={styles.categoryBadge}>{getCategoryCount(cat)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Videos Grid / List Section */}
            <section className={styles.videoGridSection}>
              {/* Stream Toolbar with View Mode & Items To Display */}
              <div className={styles.streamToolbar}>
                <div className={styles.toolbarLeft}>
                  <h2 id="video-list-section" className={styles.sectionTitle}>
                    {selectedCategory} Streams 
                    <span className={styles.resultCount}>({filteredVideos.length} available)</span>
                  </h2>
                </div>

                <div className={styles.toolbarRight}>
                  {/* Items per page selector (10, 100, 1000, 1k in single) */}
                  <div className={styles.pageSizeWrapper}>
                    <label htmlFor="page-size-select" className={styles.toolbarLabel}>Show:</label>
                    <select
                      id="page-size-select"
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(e.target.value)}
                      className={styles.pageSizeSelect}
                      title="Number of items to display"
                    >
                      <option value={10}>10 items</option>
                      <option value={100}>100 items</option>
                      <option value={1000}>1000 items</option>
                      <option value="all">1k in single (All)</option>
                    </select>
                  </div>

                  {/* View Mode Toggle: Grid vs List */}
                  <div className={styles.viewModeToggle}>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('grid')}
                      className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
                      title="Grid View (with thumbnails)"
                    >
                      <span className={styles.viewBtnIcon}>⊞</span> Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('list')}
                      className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
                      title="List View (no icons)"
                    >
                      <span className={styles.viewBtnIcon}>☰</span> List
                    </button>
                  </div>
                </div>
              </div>

              {filteredVideos.length === 0 ? (
                <div className={`${styles.noResults} glass`}>
                  <p>No streams found matching &quot;{searchQuery}&quot; in category &quot;{selectedCategory}&quot;</p>
                </div>
              ) : viewMode === 'grid' ? (
                /* GRID VIEW (with thumbnails/icons) */
                <div className={`${styles.videoGrid} ${playlistType === 'movies' ? styles.movieGrid : ''}`}>
                  {paginatedVideos.map((video) => {
                    const isPlaying = selectedVideo?.id === video.id;
                    const isMovie = playlistType === 'movies';
                    return (
                      <div
                        key={video.id}
                        onClick={() => handleVideoSelect(video)}
                        className={`${styles.videoCard} ${isMovie ? styles.movieCard : ''} glass ${isPlaying ? styles.cardPlaying : ''}`}
                      >
                        <div className={`${styles.cardThumbnailWrapper} ${isMovie ? styles.movieThumbnailWrapper : ''}`}>
                          {video.tvgLogo ? (
                            <img
                              src={video.tvgLogo}
                              alt={video.title}
                              className={styles.cardThumbnail}
                              onError={(e) => {
                                // Fallback if image fails to load
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : null}
                          <div className={styles.thumbnailFallback}>
                            <span>{video.groupTitle?.substring(0, 8) || 'DASH'}</span>
                          </div>
                          {video.duration ? (
                            <span className={styles.durationBadge}>
                              {formatDuration(video.duration)}
                            </span>
                          ) : null}
                          {isPlaying && (
                            <div className={styles.playingOverlay}>
                              <div className={styles.playingIndicator}>
                                <span></span>
                                <span></span>
                                <span></span>
                              </div>
                              <span className={styles.playingText}>Now Playing</span>
                            </div>
                          )}
                        </div>
                        
                        <div className={styles.cardDetails}>
                          <div className={styles.cardTagRow}>
                            {video.groupTitle && (
                              <span className={styles.cardCategory}>{video.groupTitle}</span>
                            )}
                            {video.isUploaded && (
                              <span
                                className={styles.uploadedBadge}
                                title={video.uploadSource ? `Imported from ${video.uploadSource}` : 'Custom uploaded playlist'}
                              >
                                Uploaded
                              </span>
                            )}
                          </div>
                          <h3 className={styles.cardTitle}>{video.title}</h3>
                          {video.description && (
                            <p className={styles.cardDesc}>{video.description}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW (NO ICON / THUMBNAIL) */
                <div className={styles.videoList}>
                  {paginatedVideos.map((video) => {
                    const isPlaying = selectedVideo?.id === video.id;
                    return (
                      <div
                        key={video.id}
                        onClick={() => handleVideoSelect(video)}
                        className={`${styles.videoListRow} glass ${isPlaying ? styles.listRowPlaying : ''}`}
                      >
                        {/* Requirement: If List Do not display icon */}
                        <div className={styles.listRowMain}>
                          <div className={styles.listRowMeta}>
                            {video.groupTitle && (
                              <span className={styles.cardCategory}>{video.groupTitle}</span>
                            )}
                            {video.isUploaded && (
                              <span
                                className={styles.uploadedBadge}
                                title={video.uploadSource ? `Imported from ${video.uploadSource}` : 'Custom uploaded playlist'}
                              >
                                Uploaded
                              </span>
                            )}
                            {video.duration ? (
                              <span className={styles.listDurationText}>
                                • {formatDuration(video.duration)}
                              </span>
                            ) : null}
                          </div>

                          <h3 className={styles.listRowTitle}>
                            {isPlaying && <span className={styles.playingIndicatorDot}>▶</span>}
                            {video.title}
                          </h3>

                          {video.description && (
                            <p className={styles.listRowDesc}>{video.description}</p>
                          )}
                        </div>

                        <div className={styles.listRowAction}>
                          <button
                            type="button"
                            className={`${styles.listPlayButton} ${isPlaying ? styles.listPlayButtonActive : ''}`}
                          >
                            {isPlaying ? 'Playing' : 'Play'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Single Page Summary or Pagination Controls */}
              {pageSize === 'all' ? (
                <div className={styles.singlePageIndicator}>
                  <span>Showing all {filteredVideos.length} streams on a single page</span>
                </div>
              ) : totalPages > 1 ? (
                <div className={styles.paginationContainer}>
                  <button
                    onClick={() => {
                      handlePageChange(Math.max(1, effectivePage - 1));
                      document.getElementById('video-list-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    disabled={effectivePage === 1}
                    className={styles.paginationButton}
                  >
                    Previous
                  </button>
                  <span className={styles.pageIndicator}>
                    Page {effectivePage} of {totalPages}
                  </span>
                  <button
                    onClick={() => {
                      handlePageChange(Math.min(totalPages, effectivePage + 1));
                      document.getElementById('video-list-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    disabled={effectivePage === totalPages}
                    className={styles.paginationButton}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </main>

      {/* Upload M3U8 Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        defaultType={playlistType}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#07090e', color: '#fff', fontFamily: 'sans-serif' }}>
        <p>Loading Dashboard...</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
