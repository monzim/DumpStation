// Package crypto provides authenticated encryption for short secrets such as
// PostgreSQL server credentials stored alongside DumpStation configuration.
//
// The Cipher wraps AES-256-GCM. Ciphertexts are base64-encoded
// (nonce || ciphertext+tag) so they fit into ordinary TEXT columns and JSON.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// KeySize is the required key length in raw bytes (AES-256).
const KeySize = 32

// ErrKeyRequired signals that no encryption key was supplied at startup.
// We fail loud rather than fall back to a hardcoded default.
var ErrKeyRequired = errors.New("encryption key is required")

// Cipher performs authenticated encryption of strings using AES-256-GCM.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher constructs a Cipher from a base64-encoded 32-byte key. Generate
// keys with `openssl rand -base64 32`.
func NewCipher(base64Key string) (*Cipher, error) {
	if base64Key == "" {
		return nil, ErrKeyRequired
	}

	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("decode key: %w", err)
	}
	if len(key) != KeySize {
		return nil, fmt.Errorf("key must decode to %d bytes, got %d", KeySize, len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("new aes cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}

	return &Cipher{aead: aead}, nil
}

// Encrypt returns base64(nonce || ciphertext+tag). Each call uses a fresh
// random nonce so repeated encryption of the same plaintext yields different
// ciphertexts.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}

	sealed := c.aead.Seal(nil, nonce, []byte(plaintext), nil)
	buf := make([]byte, 0, len(nonce)+len(sealed))
	buf = append(buf, nonce...)
	buf = append(buf, sealed...)

	return base64.StdEncoding.EncodeToString(buf), nil
}

// Decrypt reverses Encrypt. Returns an error if the ciphertext is malformed,
// truncated, or was produced under a different key.
func (c *Cipher) Decrypt(ciphertext string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, sealed := raw[:nonceSize], raw[nonceSize:]
	plain, err := c.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plain), nil
}
