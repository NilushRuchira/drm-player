'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './UploadModal.module.css';

export type PlaylistType = 'tv' | 'series' | 'movies';

interface UploadedPlaylist {
  id: string;
  filename: string;
  originalName: string;
  type: PlaylistType;
  size: number;
  itemsCount: number;
  uploadedAt: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (targetType: PlaylistType) => void;
  defaultType?: PlaylistType;
}

export default function UploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
  defaultType = 'tv',
}: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'manage'>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileTypes, setFileTypes] = useState<Record<string, PlaylistType>>({});
  const [batchType, setBatchType] = useState<PlaylistType>(defaultType);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manage tab state
  const [uploadedPlaylists, setUploadedPlaylists] = useState<UploadedPlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync batchType if defaultType changes
  useEffect(() => {
    setBatchType(defaultType);
  }, [defaultType]);

  // Load uploaded playlists when modal opens or manage tab is clicked
  const loadPlaylists = async () => {
    setIsLoadingPlaylists(true);
    try {
      const res = await fetch('/api/upload');
      if (res.ok) {
        const data = await res.json();
        setUploadedPlaylists(data.playlists || []);
      }
    } catch (err) {
      console.error('Failed to load uploaded playlists:', err);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPlaylists();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFilesAdded = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(
      (f) =>
        f.name.endsWith('.m3u') ||
        f.name.endsWith('.m3u8') ||
        f.type === 'text/plain' ||
        f.name.toLowerCase().includes('m3u')
    );

    if (validFiles.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Please select valid .m3u or .m3u8 playlist files.',
      });
      return;
    }

    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const newlyAdded = validFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...newlyAdded];
    });

    // Default each newly added file's type to current batchType
    setFileTypes((prev) => {
      const updated = { ...prev };
      validFiles.forEach((f) => {
        if (!updated[f.name]) {
          updated[f.name] = batchType;
        }
      });
      return updated;
    });

    setFeedback(null);
  };

  const handleBatchTypeChange = (newType: PlaylistType) => {
    setBatchType(newType);
    // Update all queued files to match the batch type
    setFileTypes((prev) => {
      const updated = { ...prev };
      selectedFiles.forEach((f) => {
        updated[f.name] = newType;
      });
      return updated;
    });
  };

  const handleFileTypeChange = (fileName: string, type: PlaylistType) => {
    setFileTypes((prev) => ({
      ...prev,
      [fileName]: type,
    }));
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== fileName));
    setFileTypes((prev) => {
      const copy = { ...prev };
      delete copy[fileName];
      return copy;
    });
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('type', batchType);
      formData.append('typeMapping', JSON.stringify(fileTypes));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      const totalItems = data.uploaded?.reduce(
        (acc: number, curr: { itemsCount: number }) => acc + curr.itemsCount,
        0
      ) || 0;

      setFeedback({
        type: 'success',
        message: `Successfully uploaded ${data.count} playlist(s) with ${totalItems} total streams!`,
      });

      setSelectedFiles([]);
      loadPlaylists();
      onUploadSuccess(batchType);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePlaylist = async (id: string, type: PlaylistType) => {
    if (!confirm('Are you sure you want to delete this custom playlist?')) return;

    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadPlaylists();
        onUploadSuccess(type);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete playlist');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting playlist');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getTypeLabel = (type: PlaylistType) => {
    switch (type) {
      case 'tv':
        return 'Live TV';
      case 'series':
        return 'TV Series';
      case 'movies':
        return 'Movies';
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalContent}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrapper}>
            <span className={styles.modalIcon}>📁</span>
            <h2 className={styles.modalTitle}>Manage M3U8 Playlists</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton} title="Close">
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div className={styles.tabBar}>
          <button
            onClick={() => setActiveTab('upload')}
            className={`${styles.tabButton} ${activeTab === 'upload' ? styles.tabButtonActive : ''}`}
          >
            <span>⬆</span> Upload Files
          </button>
          <button
            onClick={() => {
              setActiveTab('manage');
              loadPlaylists();
            }}
            className={`${styles.tabButton} ${activeTab === 'manage' ? styles.tabButtonActive : ''}`}
          >
            <span>📋</span> Uploaded Playlists
            {uploadedPlaylists.length > 0 && (
              <span className={styles.tabBadge}>{uploadedPlaylists.length}</span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {activeTab === 'upload' ? (
            <>
              {/* Drop Zone */}
              <div
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    handleFilesAdded(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".m3u,.m3u8,text/plain"
                  className={styles.fileInputHidden}
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesAdded(e.target.files);
                    }
                  }}
                />
                <span className={styles.dropZoneIcon}>☁️</span>
                <p className={styles.dropZoneText}>
                  Drag & drop .m3u or .m3u8 files here, or click to browse
                </p>
                <p className={styles.dropZoneSubtext}>
                  You can select multiple playlists simultaneously
                </p>
              </div>

              {/* Batch Category Selector */}
              <div className={styles.batchSelectorArea}>
                <div className={styles.batchSelectorHeader}>
                  <span className={styles.batchSelectorTitle}>Assign Category / Type:</span>
                  <span className={styles.batchSelectorHint}>Sets is live, series, or movies</span>
                </div>
                <div className={styles.typeButtonGroup}>
                  <button
                    type="button"
                    onClick={() => handleBatchTypeChange('tv')}
                    className={`${styles.typeChoiceButton} ${
                      batchType === 'tv' ? styles.typeChoiceButtonActive : ''
                    }`}
                  >
                    📺 Live TV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchTypeChange('series')}
                    className={`${styles.typeChoiceButton} ${
                      batchType === 'series' ? styles.typeChoiceButtonActive : ''
                    }`}
                  >
                    🎬 TV Series
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchTypeChange('movies')}
                    className={`${styles.typeChoiceButton} ${
                      batchType === 'movies' ? styles.typeChoiceButtonActive : ''
                    }`}
                  >
                    🎥 Movies
                  </button>
                </div>
              </div>

              {/* Selected Files Queue */}
              {selectedFiles.length > 0 && (
                <div className={styles.fileQueueSection}>
                  <div className={styles.queueHeader}>
                    <span>Selected Files ({selectedFiles.length}):</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className={styles.clearAllBtn}
                    >
                      Clear All
                    </button>
                  </div>
                  <div className={styles.fileList}>
                    {selectedFiles.map((file) => (
                      <div key={file.name} className={styles.fileItem}>
                        <div className={styles.fileInfo}>
                          <span className={styles.fileName}>{file.name}</span>
                          <span className={styles.fileMeta}>{formatFileSize(file.size)}</span>
                        </div>
                        <select
                          value={fileTypes[file.name] || batchType}
                          onChange={(e) =>
                            handleFileTypeChange(file.name, e.target.value as PlaylistType)
                          }
                          className={styles.fileTypeSelect}
                          title="Set playlist type"
                        >
                          <option value="tv">📺 Live TV</option>
                          <option value="series">🎬 TV Series</option>
                          <option value="movies">🎥 Movies</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeFile(file.name)}
                          className={styles.removeFileBtn}
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback Message */}
              {feedback && (
                <div
                  className={`${styles.feedbackMessage} ${
                    feedback.type === 'success' ? styles.successMessage : styles.errorMessage
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              {/* Upload Button */}
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isUploading}
                  className={styles.uploadActionBtn}
                >
                  {isUploading ? (
                    <>
                      <div className={styles.spinner} style={{ width: 18, height: 18 }}></div>
                      Uploading and Parsing Playlists...
                    </>
                  ) : (
                    `Upload ${selectedFiles.length} Playlist${
                      selectedFiles.length > 1 ? 's' : ''
                    } to ${getTypeLabel(batchType)}`
                  )}
                </button>
              )}
            </>
          ) : (
            /* Manage Tab */
            <div className={styles.playlistsList}>
              {isLoadingPlaylists ? (
                <div className={styles.emptyState}>
                  <p>Loading uploaded playlists...</p>
                </div>
              ) : uploadedPlaylists.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyStateIcon}>📭</span>
                  <p>No custom playlists uploaded yet.</p>
                  <p style={{ fontSize: '0.8rem' }}>
                    Switch to the &quot;Upload Files&quot; tab to add your own .m3u or .m3u8 playlists.
                  </p>
                </div>
              ) : (
                uploadedPlaylists.map((pl) => {
                  const tagClass =
                    pl.type === 'tv'
                      ? styles.tagLive
                      : pl.type === 'series'
                      ? styles.tagSeries
                      : styles.tagMovies;

                  return (
                    <div key={pl.id} className={styles.playlistCard}>
                      <div className={styles.playlistCardInfo}>
                        <div className={styles.playlistCardHeader}>
                          <span className={`${styles.categoryTag} ${tagClass}`}>
                            {getTypeLabel(pl.type)}
                          </span>
                          <span className={styles.playlistCardName} title={pl.originalName}>
                            {pl.originalName}
                          </span>
                        </div>
                        <div className={styles.playlistCardSub}>
                          <span>{pl.itemsCount} streams</span>
                          <span>•</span>
                          <span>{formatFileSize(pl.size)}</span>
                          <span>•</span>
                          <span>{new Date(pl.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePlaylist(pl.id, pl.type)}
                        className={styles.deletePlaylistBtn}
                        title="Delete this playlist"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
