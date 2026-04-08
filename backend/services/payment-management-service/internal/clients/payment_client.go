package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/models"
)

// PaymentClient handles HTTP communication with Payment Service
type PaymentClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewPaymentClient creates a new Payment Service client with 10 second timeout
func NewPaymentClient(baseURL string) *PaymentClient {
	return &PaymentClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// CreateTransfer creates a transfer to a Stripe Connect account
func (c *PaymentClient) CreateTransfer(userID, destinationAccountID string, amount float64, paymentIntentID string, description string, metadata map[string]string) (*models.TransferResponse, error) {
	reqBody := models.TransferRequest{
		UserID:               userID,
		DestinationAccountID: destinationAccountID,
		Amount:               amount,
		PaymentIntentID:      paymentIntentID,
		Description:          description,
		Metadata:             metadata,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/transfers/create",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create transfer: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		if len(respBody) > 0 {
			return nil, fmt.Errorf("payment service returned status %d: %s", resp.StatusCode, string(respBody))
		}
		return nil, fmt.Errorf("payment service returned status %d", resp.StatusCode)
	}

	var respBody models.TransferResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &respBody, nil
}

// CreateRefund creates a refund for a payment intent
func (c *PaymentClient) CreateRefund(userID, paymentIntentID string, amount *float64) (*models.RefundResponse, error) {
	reqBody := models.RefundRequest{
		UserID:          userID,
		PaymentIntentID: paymentIntentID,
		Amount:          amount,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/refunds/create",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create refund: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("payment service returned status %d", resp.StatusCode)
	}

	var respBody models.RefundResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &respBody, nil
}
