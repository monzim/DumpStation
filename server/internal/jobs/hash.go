package jobs

import (
	"crypto/sha256"
	"encoding/hex"
	"hash"
)

type hashingReader struct {
	r interface{ Read([]byte) (int, error) }
	h hash.Hash
	n int64
}

func newHashingReader(r interface{ Read([]byte) (int, error) }) *hashingReader {
	return &hashingReader{r: r, h: sha256.New()}
}

func (h *hashingReader) Read(p []byte) (int, error) {
	n, err := h.r.Read(p)
	if n > 0 {
		h.h.Write(p[:n])
		h.n += int64(n)
	}
	return n, err
}

func (h *hashingReader) Sum() string { return hex.EncodeToString(h.h.Sum(nil)) }
