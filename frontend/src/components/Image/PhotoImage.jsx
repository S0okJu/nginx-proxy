import { useState, useEffect, useRef } from 'react';
import { getImageUrl, isAuthRequiredPhotoUrl, fetchPhotoImageAsBlobUrl } from '../../config/api';

/**
 * 앨범 내 사진 표시. /photos/... URL은 JWT로 fetch 후 blob URL로 표시.
 * 공유 앨범(/share/...) 또는 절대 URL은 그대로 img src로 사용.
 */
function PhotoImage({ url, alt = '', className, loading }) {
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!url) return '';
    if (!isAuthRequiredPhotoUrl(url)) return getImageUrl(url);
    return '';
  });
  const [error, setError] = useState(false);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!url) {
      setDisplaySrc('');
      return;
    }
    if (!isAuthRequiredPhotoUrl(url)) {
      setDisplaySrc(getImageUrl(url));
      setError(false);
      return;
    }
    const token = localStorage.getItem('access_token');
    if (!token) {
      setError(true);
      return;
    }
    setError(false);
    fetchPhotoImageAsBlobUrl(url, token)
      .then((blob) => {
        blobUrlRef.current = blob;
        setDisplaySrc(blob);
      })
      .catch(() => setError(true));
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [url]);

  if (!url) return null;
  if (error) return <span className={className} aria-label={alt}>이미지를 불러올 수 없습니다.</span>;
  if (!displaySrc) return <span className={className} aria-label={alt}>로딩 중...</span>;

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
}

export default PhotoImage;
