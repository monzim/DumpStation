package validator

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
)

// Validator wraps the validator instance
type Validator struct {
	validate *validator.Validate
}

// ValidationError represents a single validation error with field and message
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrorResponse represents the API response for validation errors
type ValidationErrorResponse struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Errors  []ValidationError `json:"errors"`
}

// New creates a new validator instance
func New() *Validator {
	return &Validator{
		validate: validator.New(),
	}
}

// Validate validates a struct and returns formatted error messages
func (v *Validator) Validate(data interface{}) (*ValidationErrorResponse, error) {
	err := v.validate.Struct(data)
	if err == nil {
		return nil, nil
	}

	var errors []ValidationError
	var validationErrors validator.ValidationErrors

	if ve, ok := err.(validator.ValidationErrors); ok {
		validationErrors = ve
	} else {
		return nil, err
	}

	for _, fieldError := range validationErrors {
		fieldName := fieldError.Field()
		tag := fieldError.Tag()
		param := fieldError.Param()

		message := getErrorMessage(fieldName, tag, param, fieldError.Kind().String())

		errors = append(errors, ValidationError{
			Field:   fieldName,
			Message: message,
		})
	}

	return &ValidationErrorResponse{
		Code:    "VALIDATION_ERROR",
		Message: "Invalid request: one or more validation errors occurred",
		Errors:  errors,
	}, nil
}

// ValidateVar validates a single variable
func (v *Validator) ValidateVar(field interface{}, tag string) error {
	return v.validate.Var(field, tag)
}

// getErrorMessage generates a user-friendly error message based on validation tag
func getErrorMessage(fieldName, tag, param string, kind string) string {
	// Convert snake_case to readable format
	readableField := toReadableFieldName(fieldName)

	switch tag {
	case "required":
		return fmt.Sprintf("%s is required", readableField)

	case "email":
		return fmt.Sprintf("%s must be a valid email address", readableField)

	case "url":
		return fmt.Sprintf("%s must be a valid URL", readableField)

	case "min":
		switch kind {
		case "string":
			return fmt.Sprintf("%s must be at least %s characters long", readableField, param)
		case "number":
			return fmt.Sprintf("%s must be at least %s", readableField, param)
		default:
			return fmt.Sprintf("%s must have a minimum value of %s", readableField, param)
		}

	case "max":
		switch kind {
		case "string":
			return fmt.Sprintf("%s must not exceed %s characters", readableField, param)
		case "number":
			return fmt.Sprintf("%s must not exceed %s", readableField, param)
		default:
			return fmt.Sprintf("%s must have a maximum value of %s", readableField, param)
		}

	case "len":
		switch kind {
		case "string":
			return fmt.Sprintf("%s must be exactly %s characters long", readableField, param)
		default:
			return fmt.Sprintf("%s must have a length of %s", readableField, param)
		}

	case "oneof":
		values := strings.Split(param, " ")
		return fmt.Sprintf("%s must be one of: %s", readableField, strings.Join(values, ", "))

	case "numeric":
		return fmt.Sprintf("%s must be numeric", readableField)

	case "alpha":
		return fmt.Sprintf("%s must contain only alphabetic characters", readableField)

	case "alphanum":
		return fmt.Sprintf("%s must contain only alphanumeric characters", readableField)

	case "gte":
		return fmt.Sprintf("%s must be greater than or equal to %s", readableField, param)

	case "gt":
		return fmt.Sprintf("%s must be greater than %s", readableField, param)

	case "lte":
		return fmt.Sprintf("%s must be less than or equal to %s", readableField, param)

	case "lt":
		return fmt.Sprintf("%s must be less than %s", readableField, param)

	case "eqfield":
		return fmt.Sprintf("%s must match %s", readableField, toReadableFieldName(param))

	case "nefield":
		return fmt.Sprintf("%s must not equal %s", readableField, toReadableFieldName(param))

	case "startswith":
		return fmt.Sprintf("%s must start with %s", readableField, param)

	case "endswith":
		return fmt.Sprintf("%s must end with %s", readableField, param)

	case "contains":
		return fmt.Sprintf("%s must contain %s", readableField, param)

	case "excludes":
		return fmt.Sprintf("%s must not contain %s", readableField, param)

	case "json":
		return fmt.Sprintf("%s must be valid JSON", readableField)

	case "uuid":
		return fmt.Sprintf("%s must be a valid UUID", readableField)

	default:
		return fmt.Sprintf("%s failed validation on tag: %s", readableField, tag)
	}
}

// toReadableFieldName converts field name to readable format
// e.g., "userName" -> "User Name", "user_name" -> "User Name"
func toReadableFieldName(fieldName string) string {
	// Replace underscores with spaces
	readable := strings.ReplaceAll(fieldName, "_", " ")

	// Insert space before uppercase letters (camelCase)
	var result strings.Builder
	for i, char := range readable {
		if i > 0 && char >= 'A' && char <= 'Z' && readable[i-1] != ' ' {
			result.WriteRune(' ')
		}
		result.WriteRune(char)
	}

	// Capitalize first letter
	readable = result.String()
	if len(readable) > 0 {
		readable = strings.ToUpper(string(readable[0])) + readable[1:]
	}

	return readable
}

// ValidateFieldString validates a string field with custom rules
func (v *Validator) ValidateFieldString(fieldName, value, rules string) *ValidationError {
	if err := v.validate.Var(value, rules); err != nil {
		if validationErr, ok := err.(validator.FieldError); ok {
			message := getErrorMessage(fieldName, validationErr.Tag(), validationErr.Param(), validationErr.Kind().String())
			return &ValidationError{
				Field:   fieldName,
				Message: message,
			}
		}
	}
	return nil
}

// ValidateFieldInt validates an int field with custom rules
func (v *Validator) ValidateFieldInt(fieldName string, value int, rules string) *ValidationError {
	if err := v.validate.Var(value, rules); err != nil {
		if validationErr, ok := err.(validator.FieldError); ok {
			message := getErrorMessage(fieldName, validationErr.Tag(), validationErr.Param(), validationErr.Kind().String())
			return &ValidationError{
				Field:   fieldName,
				Message: message,
			}
		}
	}
	return nil
}
