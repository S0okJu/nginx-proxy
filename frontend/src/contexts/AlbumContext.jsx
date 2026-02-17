import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiEndpoints, apiRequest, API_BASE_URL } from '../config/api';

const AlbumContext = createContext(null);

export function AlbumProvider({ children }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(false);

  // 앨범 목록 가져오기
  const fetchAlbums = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setAlbums([]);
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest(apiEndpoints.albums());
      // 백엔드 응답을 프론트엔드 형식으로 변환
      const formattedAlbums = data.map(album => ({
        id: album.id.toString(),
        name: album.name,
        description: album.description || '',
        createdAt: album.created_at ? new Date(album.created_at).toLocaleDateString('ko-KR') : '',
        photoCount: album.photo_count || 0,
        images: [], // 상세 조회 시 로드
        shareLink: null, // 별도 조회 필요
      }));
      setAlbums(formattedAlbums);
    } catch (error) {
      console.error('Failed to fetch albums:', error);
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 앨범 추가
  const addAlbum = async (albumData) => {
    const response = await fetch(apiEndpoints.albums(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        name: albumData.name,
        description: albumData.description || '',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '앨범 생성에 실패했습니다.' }));
      throw new Error(error.detail);
    }

    const newAlbum = await response.json();
    const formattedAlbum = {
      id: newAlbum.id.toString(),
      name: newAlbum.name,
      description: newAlbum.description || '',
      createdAt: newAlbum.created_at ? new Date(newAlbum.created_at).toLocaleDateString('ko-KR') : new Date().toLocaleDateString('ko-KR'),
      photoCount: 0,
      images: [],
      shareLink: null,
    };

    setAlbums(prev => [...prev, formattedAlbum]);
    return formattedAlbum;
  };

  // 앨범 수정
  const updateAlbum = async (albumId, albumData) => {
    const response = await fetch(apiEndpoints.album(albumId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        name: albumData.name,
        description: albumData.description !== undefined ? albumData.description : null,
        cover_photo_id: albumData.cover_photo_id || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '앨범 수정에 실패했습니다.' }));
      throw new Error(error.detail);
    }

    const updatedAlbum = await response.json();
    const formattedAlbum = {
      id: updatedAlbum.id.toString(),
      name: updatedAlbum.name,
      description: updatedAlbum.description || '',
      createdAt: updatedAlbum.created_at ? new Date(updatedAlbum.created_at).toLocaleDateString('ko-KR') : '',
      photoCount: updatedAlbum.photo_count || 0,
      images: [], // 상세 조회 시 로드
      shareLink: null, // 별도 조회 필요
    };

    setAlbums(prev => prev.map(a => 
      a.id === albumId.toString() ? formattedAlbum : a
    ));

    return formattedAlbum;
  };

  // 앨범 삭제
  const deleteAlbum = async (albumId) => {
    const response = await fetch(apiEndpoints.album(albumId), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => ({ detail: '앨범 삭제에 실패했습니다.' }));
      throw new Error(error.detail);
    }

    setAlbums(prev => prev.filter(a => a.id !== albumId.toString()));
  };

  // 앨범 상세 조회 (사진 포함)
  const getAlbum = async (albumId) => {
    try {
      const data = await apiRequest(apiEndpoints.album(albumId));
      
      const formattedAlbum = {
        id: data.id.toString(),
        name: data.name,
        description: data.description || '',
        createdAt: data.created_at ? new Date(data.created_at).toLocaleDateString('ko-KR') : '',
        images: (data.photos || []).map(photo => ({
          id: photo.id.toString(),
          name: photo.title || '',
          description: photo.description || '',
          url: photo.url || '',
          createdAt: photo.created_at ? new Date(photo.created_at).toLocaleDateString('ko-KR') : '',
        })),
        shareLink: null,
      };

      // 공유 링크 조회
      try {
        const shareLinks = await apiRequest(apiEndpoints.albumShare(albumId));
        if (shareLinks && shareLinks.length > 0) {
          const activeLink = shareLinks.find(sl => sl.is_active);
          if (activeLink) {
            formattedAlbum.shareLink = activeLink.token;
          }
        }
      } catch (e) {
        // 공유 링크 조회 실패는 무시
      }

      return formattedAlbum;
    } catch (error) {
      console.error('Failed to get album:', error);
      return null;
    }
  };

  // 공유 링크로 앨범 조회 (인증 불필요) - 로컬 캐시에서 조회
  const getAlbumByShareLink = (shareLink) => {
    // 이 함수는 더 이상 사용하지 않음 - SharedAlbum.jsx에서 직접 API 호출
    return null;
  };

  // 이미지 추가 (Presigned URL 방식)
  const addImage = async (albumId, imageData, onProgress) => {
    // 파일이 없으면 에러
    if (!imageData.file && !imageData.url) {
      throw new Error('사진 파일 또는 URL을 입력해주세요.');
    }

    // URL인 경우 별도 처리 (백엔드에서 지원하지 않을 수 있음)
    if (imageData.url && !imageData.file) {
      // URL 기반 사진 추가는 백엔드에서 지원하지 않을 수 있음
      // 임시로 로컬 상태에만 추가
      const newImage = {
        id: Date.now().toString(),
        name: imageData.name,
        description: imageData.description || '',
        url: imageData.url,
        createdAt: new Date().toLocaleDateString('ko-KR'),
      };

      setAlbums(prev => prev.map(album => {
        if (album.id === albumId.toString()) {
          return {
            ...album,
            images: [...(album.images || []), newImage],
          };
        }
        return album;
      }));

      return newImage;
    }

    // 파일 업로드 (Presigned URL 방식)
    if (!imageData.file) {
      throw new Error('사진 파일을 선택해주세요.');
    }

    const file = imageData.file;

    // 파일 크기 검증 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('파일 크기는 10MB를 초과할 수 없습니다.');
    }

    // 파일 형식 검증 및 Content-Type 고정 (presigned 서명과 PUT 헤더가 반드시 동일해야 함)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'];
    const extToType = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' };
    const contentType = allowedTypes.includes(file.type)
      ? file.type
      : (extToType[file.name.split('.').pop()?.toLowerCase()] || 'application/octet-stream');
    if (!allowedTypes.includes(contentType)) {
      throw new Error('지원하지 않는 파일 형식입니다. (지원: JPEG, PNG, GIF, WebP, HEIC)');
    }

    try {
      // 1. Presigned URL 발급 (content_type과 PUT 시 Content-Type을 동일하게 사용해야 Signature 일치)
      if (onProgress) onProgress(10); // 10% - Presigned URL 요청 중
      
      const presignedResponse = await fetch(apiEndpoints.photosPresignedUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          album_id: parseInt(albumId),
          filename: file.name,
          content_type: contentType,
          file_size: file.size,
          title: imageData.name || null,
          description: imageData.description || null,
        }),
      });

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json().catch(() => ({ detail: 'Presigned URL 발급에 실패했습니다.' }));
        throw new Error(error.detail || 'Presigned URL 발급에 실패했습니다.');
      }

      const presignedData = await presignedResponse.json();
      if (onProgress) onProgress(20); // 20% - Presigned URL 발급 완료

      // 2. Object Storage에 직접 업로드 (Swift Temp URL + XHR PUT)
      // Swift API 경로 사용 → 컨테이너 CORS 설정이 OPTIONS preflight 처리
      const uploadedUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const percentComplete = 20 + Math.round((event.loaded / event.total) * 70);
            onProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(presignedData.upload_url);
          } else {
            reject(new Error('파일 업로드에 실패했습니다.'));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('파일 업로드 중 네트워크 오류가 발생했습니다.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('파일 업로드가 취소되었습니다.'));
        });

        xhr.open('PUT', presignedData.upload_url);
        const putContentType = (presignedData.upload_headers && presignedData.upload_headers['Content-Type']) || contentType;
        xhr.setRequestHeader('Content-Type', putContentType);
        xhr.send(file);
      });

      if (onProgress) onProgress(90); // 90% - 파일 업로드 완료

      // 3. 업로드 완료 확인
      const confirmResponse = await fetch(apiEndpoints.photosConfirm(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          photo_id: presignedData.photo_id,
        }),
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json().catch(() => ({ detail: '업로드 확인에 실패했습니다.' }));
        throw new Error(error.detail || '업로드 확인에 실패했습니다.');
      }

      const confirmData = await confirmResponse.json();
      if (onProgress) onProgress(100); // 100% - 완료

      // 백엔드에서 이미 앨범에 사진을 자동으로 추가하므로 별도 API 호출 불필요
      const newImage = {
        id: confirmData.photo_id.toString(),
        name: imageData.name || '',
        description: imageData.description || '',
        url: confirmData.url || '',
        createdAt: new Date().toLocaleDateString('ko-KR'),
      };

      return newImage;

    } catch (error) {
      console.error('Photo upload error:', error);
      throw error;
    }
  };

  // 이미지 삭제
  const deleteImage = async (albumId, imageId) => {
    // 앨범에서 사진 제거
    const response = await fetch(`${apiEndpoints.album(albumId)}/photos`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ photo_ids: [parseInt(imageId)] }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '사진 삭제에 실패했습니다.' }));
      throw new Error(error.detail);
    }

    setAlbums(prev => prev.map(album => {
      if (album.id === albumId.toString()) {
        return {
          ...album,
          images: (album.images || []).filter(img => img.id !== imageId.toString()),
        };
      }
      return album;
    }));
  };

  // 공유 링크 생성
  const createShareLink = async (albumId) => {
    const response = await fetch(apiEndpoints.albumShare(albumId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ expires_in_days: 30 }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '공유 링크 생성에 실패했습니다.' }));
      throw new Error(error.detail);
    }

    const shareLink = await response.json();

    setAlbums(prev => prev.map(album => {
      if (album.id === albumId.toString()) {
        return { ...album, shareLink: shareLink.token };
      }
      return album;
    }));

    return shareLink.token;
  };

  // 공유 링크 삭제
  const deleteShareLink = async (albumId) => {
    // 먼저 공유 링크 목록 조회
    const shareLinks = await apiRequest(apiEndpoints.albumShare(albumId));
    
    for (const link of shareLinks) {
      if (link.is_active) {
        await fetch(`${apiEndpoints.albumShare(albumId)}/${link.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
      }
    }

    setAlbums(prev => prev.map(album => {
      if (album.id === albumId.toString()) {
        return { ...album, shareLink: null };
      }
      return album;
    }));
  };

  const value = {
    albums,
    loading,
    fetchAlbums,
    addAlbum,
    updateAlbum,
    deleteAlbum,
    getAlbum,
    getAlbumByShareLink,
    addImage,
    deleteImage,
    createShareLink,
    deleteShareLink,
  };

  return (
    <AlbumContext.Provider value={value}>
      {children}
    </AlbumContext.Provider>
  );
}

export function useAlbums() {
  const context = useContext(AlbumContext);
  if (!context) {
    throw new Error('useAlbums must be used within an AlbumProvider');
  }
  return context;
}
