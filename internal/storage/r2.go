package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsConfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type UploadErrorKind int

const (
	UploadErrInvalid UploadErrorKind = iota + 1
	UploadErrTooLarge
	UploadErrUnsupportedType
	UploadErrNotConfigured
	UploadErrInternal
)

type UploadError struct {
	Kind    UploadErrorKind
	Message string
	Err     error
}

func (e *UploadError) Error() string { return e.Message }
func (e *UploadError) Unwrap() error { return e.Err }

func IsClientUploadError(err error) bool {
	var ue *UploadError
	if !errors.As(err, &ue) {
		return false
	}
	switch ue.Kind {
	case UploadErrInvalid, UploadErrTooLarge, UploadErrUnsupportedType:
		return true
	default:
		return false
	}
}

type r2Settings struct {
	endpoint      string
	accessKeyID   string
	secretKey     string
	bucket        string
	publicBaseURL string
	region        string
	stripMetadata bool
}

var (
	r2Once    sync.Once
	r2Client  *s3.Client
	r2Cfg     r2Settings
	r2InitErr error
)

func getR2Settings() (r2Settings, error) {
	endpoint := strings.TrimSpace(config.GetEnv("R2_ENDPOINT", ""))
	accessKeyID := strings.TrimSpace(config.GetEnv("R2_ACCESS_KEY_ID", ""))
	secretKey := strings.TrimSpace(config.GetEnv("R2_SECRET_ACCESS_KEY", ""))
	bucket := strings.TrimSpace(config.GetEnv("R2_BUCKET", ""))
	publicBaseURL := strings.TrimSpace(config.GetEnv("R2_PUBLIC_BASE_URL", ""))
	region := strings.TrimSpace(config.GetEnv("R2_REGION", "auto"))
	stripMetadata := strings.EqualFold(strings.TrimSpace(config.GetEnv("STRIP_IMAGE_METADATA", "false")), "true")

	missing := make([]string, 0, 5)
	if endpoint == "" {
		missing = append(missing, "R2_ENDPOINT")
	}
	if accessKeyID == "" {
		missing = append(missing, "R2_ACCESS_KEY_ID")
	}
	if secretKey == "" {
		missing = append(missing, "R2_SECRET_ACCESS_KEY")
	}
	if bucket == "" {
		missing = append(missing, "R2_BUCKET")
	}
	if publicBaseURL == "" {
		missing = append(missing, "R2_PUBLIC_BASE_URL")
	}
	if len(missing) > 0 {
		return r2Settings{}, &UploadError{Kind: UploadErrNotConfigured, Message: "Thumbnail storage is not configured (missing: " + strings.Join(missing, ", ") + ")", Err: nil}
	}

	publicBaseURL = strings.TrimRight(publicBaseURL, "/")

	return r2Settings{
		endpoint:      endpoint,
		accessKeyID:   accessKeyID,
		secretKey:     secretKey,
		bucket:        bucket,
		publicBaseURL: publicBaseURL,
		region:        region,
		stripMetadata: stripMetadata,
	}, nil
}

func getR2Client(ctx context.Context) (*s3.Client, r2Settings, error) {
	r2Once.Do(func() {
		cfg, err := getR2Settings()
		if err != nil {
			r2InitErr = err
			return
		}

		awsCfg, err := awsConfig.LoadDefaultConfig(
			ctx,
			awsConfig.WithRegion(cfg.region),
			awsConfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.accessKeyID, cfg.secretKey, "")),
		)
		if err != nil {
			r2InitErr = &UploadError{Kind: UploadErrInternal, Message: "Failed to initialize thumbnail storage", Err: err}
			return
		}

		r2Cfg = cfg
		r2Client = s3.NewFromConfig(awsCfg, func(o *s3.Options) {
			o.UsePathStyle = true
			o.BaseEndpoint = aws.String(cfg.endpoint)
		})
	})

	if r2InitErr != nil {
		return nil, r2Settings{}, r2InitErr
	}
	return r2Client, r2Cfg, nil
}

func randomHex(bytesLen int) (string, error) {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func allowedImageExtAndType(detected string) (ext string, contentType string, ok bool) {
	switch strings.ToLower(strings.TrimSpace(detected)) {
	case "image/jpeg":
		return ".jpg", "image/jpeg", true
	case "image/png":
		return ".png", "image/png", true
	case "image/webp":
		return ".webp", "image/webp", true
	case "image/gif":
		return ".gif", "image/gif", true
	default:
		return "", "", false
	}
}

func sniffContentType(r io.Reader) (string, []byte, error) {
	buf := make([]byte, 512)
	n, err := io.ReadFull(r, buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", nil, err
	}
	buf = buf[:n]
	return http.DetectContentType(buf), buf, nil
}

func maybeStripMetadata(cfg r2Settings, detectedType string, data []byte) ([]byte, error) {
	if !cfg.stripMetadata {
		return data, nil
	}

	switch detectedType {
	case "image/jpeg":
		img, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, &UploadError{Kind: UploadErrInvalid, Message: "Invalid JPEG image", Err: err}
		}
		var out bytes.Buffer
		if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 90}); err != nil {
			return nil, &UploadError{Kind: UploadErrInternal, Message: "Failed to process thumbnail", Err: err}
		}
		return out.Bytes(), nil
	case "image/png":
		img, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, &UploadError{Kind: UploadErrInvalid, Message: "Invalid PNG image", Err: err}
		}
		var out bytes.Buffer
		enc := png.Encoder{CompressionLevel: png.DefaultCompression}
		if err := enc.Encode(&out, img); err != nil {
			return nil, &UploadError{Kind: UploadErrInternal, Message: "Failed to process thumbnail", Err: err}
		}
		return out.Bytes(), nil
	default:
		
		return data, nil
	}
}

// UploadThumbnail uploads the provided multipart file to Cloudflare R2.
func UploadThumbnail(ctx context.Context, fileHeader *multipart.FileHeader, maxBytes int64) (publicURL string, err error) {
	if fileHeader == nil {
		return "", &UploadError{Kind: UploadErrInvalid, Message: "Missing thumbnail file", Err: nil}
	}
	if maxBytes <= 0 {
		maxBytes = 5 << 20
	}
	if fileHeader.Size > 0 && fileHeader.Size > maxBytes {
		return "", &UploadError{Kind: UploadErrTooLarge, Message: "Thumbnail too large (max 5MB)", Err: nil}
	}

	client, cfg, err := getR2Client(ctx)
	if err != nil {
		return "", err
	}

	f, err := fileHeader.Open()
	if err != nil {
		return "", &UploadError{Kind: UploadErrInternal, Message: "Failed to read thumbnail", Err: err}
	}
	defer f.Close()

	detected, head, err := sniffContentType(f)
	if err != nil {
		return "", &UploadError{Kind: UploadErrInvalid, Message: "Failed to read thumbnail", Err: err}
	}

	ext, contentType, ok := allowedImageExtAndType(detected)
	if !ok {
		return "", &UploadError{Kind: UploadErrUnsupportedType, Message: fmt.Sprintf("Unsupported image type: %s", detected), Err: nil}
	}

	// Read the full file into memory
	remaining := maxBytes - int64(len(head))
	if remaining < 0 {
		remaining = 0
	}
	rest, err := io.ReadAll(io.LimitReader(f, remaining+1))
	if err != nil {
		return "", &UploadError{Kind: UploadErrInvalid, Message: "Failed to read thumbnail", Err: err}
	}
	data := append(head, rest...)
	if int64(len(data)) > maxBytes {
		return "", &UploadError{Kind: UploadErrTooLarge, Message: "Thumbnail too large (max 5MB)", Err: nil}
	}

	data, err = maybeStripMetadata(cfg, contentType, data)
	if err != nil {
		return "", err
	}
	if int64(len(data)) > maxBytes {
		return "", &UploadError{Kind: UploadErrTooLarge, Message: "Thumbnail too large (max 5MB)", Err: nil}
	}

	keyRand, err := randomHex(16)
	if err != nil {
		return "", &UploadError{Kind: UploadErrInternal, Message: "Failed to store thumbnail", Err: err}
	}
	key := path.Join("thumbnails", keyRand+ext)

	putCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	_, err = client.PutObject(putCtx, &s3.PutObjectInput{
		Bucket:      aws.String(cfg.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", &UploadError{Kind: UploadErrInternal, Message: "Failed to store thumbnail", Err: err}
	}

	return cfg.publicBaseURL + "/" + key, nil
}
