package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func newTestCipher(t *testing.T) *Cipher {
	t.Helper()
	key := make([]byte, KeySize)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("read key: %v", err)
	}
	c, err := NewCipher(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	return c
}

func TestNewCipherErrors(t *testing.T) {
	cases := []struct {
		name string
		key  string
		want string
	}{
		{"empty", "", "encryption key is required"},
		{"not-base64", "not-base64!!!", "decode key"},
		{"wrong-length", base64.StdEncoding.EncodeToString([]byte("too-short")), "key must decode to 32 bytes"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewCipher(tc.key)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.want)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected error containing %q, got %v", tc.want, err)
			}
		})
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	c := newTestCipher(t)
	inputs := []string{
		"",
		"hunter2",
		"a much longer passphrase with spaces, punctuation, and emoji 🐘",
		strings.Repeat("x", 4096),
	}
	for _, in := range inputs {
		ct, err := c.Encrypt(in)
		if err != nil {
			t.Fatalf("Encrypt: %v", err)
		}
		got, err := c.Decrypt(ct)
		if err != nil {
			t.Fatalf("Decrypt: %v", err)
		}
		if got != in {
			t.Fatalf("round-trip mismatch: got %q want %q", got, in)
		}
	}
}

func TestEncryptIsNonDeterministic(t *testing.T) {
	c := newTestCipher(t)
	a, err := c.Encrypt("same-plaintext")
	if err != nil {
		t.Fatal(err)
	}
	b, err := c.Encrypt("same-plaintext")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("expected distinct ciphertexts for repeated encryption (random nonce)")
	}
}

func TestDecryptRejectsWrongKey(t *testing.T) {
	c1 := newTestCipher(t)
	c2 := newTestCipher(t)
	ct, err := c1.Encrypt("secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c2.Decrypt(ct); err == nil {
		t.Fatal("expected decryption with a different key to fail")
	}
}

func TestDecryptRejectsMalformed(t *testing.T) {
	c := newTestCipher(t)
	cases := []string{
		"!!!not-base64!!!",
		base64.StdEncoding.EncodeToString([]byte("short")), // shorter than nonce
		base64.StdEncoding.EncodeToString(make([]byte, 32)), // valid base64 but garbage payload
	}
	for _, in := range cases {
		if _, err := c.Decrypt(in); err == nil {
			t.Fatalf("expected error for input %q", in)
		}
	}
}
