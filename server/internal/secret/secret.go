// Package secret provides transparent at-rest encryption for sensitive
// configuration columns (database passwords, storage keys, webhook URLs,
// TOTP secrets).
//
// Encrypted values carry the "enc:v1:" prefix. Values without the prefix are
// treated as legacy plaintext and returned unchanged, so installations that
// upgrade from v1 keep working: old rows stay readable and are encrypted the
// next time they are written.
//
// Columns opt in with the GORM tag `serializer:secret`.
package secret

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"

	"github.com/monzim/db_proxy/v1/internal/crypto"
	"gorm.io/gorm/schema"
)

// Prefix marks a value encrypted by this package.
const Prefix = "enc:v1:"

var (
	mu     sync.RWMutex
	cipher *crypto.Cipher
)

func init() {
	schema.RegisterSerializer("secret", Serializer{})
}

// Configure installs the process-wide cipher. Until it is called, Seal is a
// no-op (values are stored as plaintext), which keeps unit tests simple.
func Configure(c *crypto.Cipher) {
	mu.Lock()
	cipher = c
	mu.Unlock()
}

func current() *crypto.Cipher {
	mu.RLock()
	defer mu.RUnlock()
	return cipher
}

// IsSealed reports whether v carries the encrypted-value prefix.
func IsSealed(v string) bool { return strings.HasPrefix(v, Prefix) }

// Seal encrypts v. Empty strings and already-sealed values are returned as is.
func Seal(v string) (string, error) {
	if v == "" || IsSealed(v) {
		return v, nil
	}
	c := current()
	if c == nil {
		return v, nil
	}
	ct, err := c.Encrypt(v)
	if err != nil {
		return "", fmt.Errorf("seal secret: %w", err)
	}
	return Prefix + ct, nil
}

// Open decrypts v when it is sealed; plaintext legacy values pass through.
func Open(v string) (string, error) {
	if !IsSealed(v) {
		return v, nil
	}
	c := current()
	if c == nil {
		return "", fmt.Errorf("open secret: encryption key not configured")
	}
	pt, err := c.Decrypt(strings.TrimPrefix(v, Prefix))
	if err != nil {
		return "", fmt.Errorf("open secret: %w", err)
	}
	return pt, nil
}

// Serializer implements gorm's SerializerInterface for string fields.
type Serializer struct{}

// Scan decrypts the database value into the struct field.
func (Serializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue interface{}) error {
	var raw string
	switch v := dbValue.(type) {
	case nil:
		raw = ""
	case string:
		raw = v
	case []byte:
		raw = string(v)
	default:
		return fmt.Errorf("secret serializer: unsupported db type %T", dbValue)
	}
	pt, err := Open(raw)
	if err != nil {
		return err
	}
	return field.Set(ctx, dst, pt)
}

// Value encrypts the struct field before it is written.
func (Serializer) Value(ctx context.Context, field *schema.Field, dst reflect.Value, fieldValue interface{}) (interface{}, error) {
	var s string
	switch v := fieldValue.(type) {
	case string:
		s = v
	case *string:
		if v == nil {
			return nil, nil
		}
		s = *v
	default:
		return nil, fmt.Errorf("secret serializer: unsupported field type %T", fieldValue)
	}
	return Seal(s)
}
