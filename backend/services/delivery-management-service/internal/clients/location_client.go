package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/models"
)

// LocationClient handles HTTP communication with Location Service
type LocationClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewLocationClient creates a new Location Service client with 5 second timeout
func NewLocationClient(baseURL string) *LocationClient {
	return &LocationClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// CreateLocationSession creates a new location tracking session
func (c *LocationClient) CreateLocationSession(orderID, buyerID, runnerID string) (string, error) {
	reqBody := models.CreateLocationSessionRequest{
		OrderID:  orderID,
		BuyerID:  buyerID,
		RunnerID: runnerID,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/location/sessions",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return "", fmt.Errorf("failed to create location session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("location service returned status %d", resp.StatusCode)
	}

	var respBody models.CreateLocationSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return respBody.SessionID, nil
}

// CloseLocationSession closes an existing location tracking session
func (c *LocationClient) CloseLocationSession(sessionID string) error {
	req, err := http.NewRequest(
		http.MethodPut,
		fmt.Sprintf("%s/location/sessions/%s/close", c.baseURL, sessionID),
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to close location session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("location service returned status %d", resp.StatusCode)
	}

	return nil
}
