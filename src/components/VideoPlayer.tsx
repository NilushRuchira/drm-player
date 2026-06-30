'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './VideoPlayer.module.css';

// Import CSS for Shaka Player UI
import 'shaka-player/dist/controls.css';

interface VideoPlayerProps {
  url: string;
  title: string;
  description?: string;
  licenseKey?: string;
  licenseType?: string;
}

export default function VideoPlayer({
  url,
  title,
  description,
  licenseKey,
  licenseType = 'com.widevine.alpha',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerInstance, setPlayerInstance] = useState<any>(null);

  useEffect(() => {
    // Dynamic import to prevent SSR errors (since Shaka Player uses window/navigator APIs)
    const shaka = require('shaka-player/dist/shaka-player.ui.js');

    const video = videoRef.current;
    const container = containerRef.current;

    if (!video || !container) return;

    setError(null);
    setLoading(true);

    // Initialize the Shaka Player
    const player = new shaka.Player(video);
    setPlayerInstance(player);

    // Initialize Shaka UI Overlay
    const ui = new shaka.ui.Overlay(player, container, video);
    
    // Customize controls UI
    const uiConfig = {
      controlPanelElements: [
        'play_pause',
        'time_and_duration',
        'spacer',
        'mute',
        'volume',
        'quality',
        'fullscreen',
        'overflow_menu'
      ],
      addSeekBar: true,
      fadeDelay: 3,
    };
    ui.configure(uiConfig);

    // DRM Configuration
    if (licenseKey && licenseType) {
      player.configure({
        drm: {
          servers: {
            [licenseType]: licenseKey,
          },
        },
      });
    }

    // Intercept all remote requests (manifest, segments, license) and route them through our backend path-mirroring proxy
    player.getNetworkingEngine().registerRequestFilter((type: number, request: any) => {
      const uri = request.uris[0];
      if (uri && uri.startsWith('http') && !uri.includes('/api/proxy/')) {
        // Dynamic check for current page host (localhost, network IP, custom domain, etc.)
        const isLocal = uri.includes('localhost') || uri.includes('127.0.0.1') || uri.includes(window.location.host);
        if (!isLocal) {
          request.uris[0] = `/api/proxy/${uri.replace('://', '/')}`;
          console.log(`Proxied request type ${type}:`, uri);
        }
      }
    });

    const onError = (errorEvent: any) => {
      const err = errorEvent.detail || errorEvent;
      console.error('Shaka Player Error code:', err.code, 'severity:', err.severity, err);
      
      // Map common error codes to user-friendly messages
      let message = `Playback Error (Code ${err.code}).`;
      if (err.code === 6007) {
        message = 'DRM license request failed. This stream is copy-protected, and the licensing server is refusing access or is unreachable.';
      } else if (err.code === 1001) {
        message = 'Network error: The manifest could not be fetched. Check your internet connection or stream server CORS policies.';
      } else if (err.code === 6001) {
        message = 'DRM decryption keys not found or Widevine CDM is not supported in this browser.';
      } else if (err.code === 6012) {
        message = 'Failed to load DRM: license keys mismatch or invalid response format.';
      } else if (err.code === 3016) {
        message = 'CORS blocker: The video manifest or license server is blocking this origin (localhost).';
      }
      
      setError(message);
      setLoading(false);
    };

    player.addEventListener('error', onError);

    // Load the video source
    player.load(url)
      .then(() => {
        setLoading(false);
        console.log('Video loaded successfully');
      })
      .catch((err: any) => {
        onError({ detail: err });
      });

    // Cleanup resources on unmount
    return () => {
      player.destroy();
      ui.destroy();
    };
  }, [url, licenseKey, licenseType]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.videoOuterContainer}>
        {/* Shaka UI container wrapper */}
        <div ref={containerRef} className={`${styles.videoContainer} glass`} data-shaka-player-container>
          <video
            ref={videoRef}
            className={styles.videoElement}
            autoPlay
            playsInline
            data-shaka-player
          />

          {loading && (
            <div className={styles.loaderContainer}>
              <div className={styles.spinner}></div>
              <p>Loading Secure Stream...</p>
            </div>
          )}

          {error && (
            <div className={styles.errorOverlay}>
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className={styles.errorTitle}>Playback Refused</h3>
              <p className={styles.errorMessage}>{error}</p>
              <div className={styles.errorTips}>
                <strong>Troubleshooting tips:</strong>
                <ul>
                  <li>Ensure the browser supports Widevine (Chrome, Edge, Firefox, Brave).</li>
                  <li>Check if the license URL <code className={styles.code}>{licenseKey}</code> is online.</li>
                  <li>Verify if your browser requires a CORS proxy for these URLs.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.infoSection}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
        {licenseKey && (
          <div className={styles.drmBadge}>
            <span className={styles.badgeLabel}>Widevine DRM Protected</span>
            <span className={styles.badgeDetails}>License Server: {licenseKey}</span>
          </div>
        )}
      </div>
    </div>
  );
}
