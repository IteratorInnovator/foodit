package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/models"
)

// ChatClient handles HTTP communication with Chat Service
type ChatClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewChatClient creates a new Chat Service client with 5 second timeout
func NewChatClient(baseURL string) *ChatClient {
	return &ChatClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// CreateChatRoom creates a new chat room for the given order, buyer, and runner
func (c *ChatClient) CreateChatRoom(orderID, buyerID, runnerID string) (string, error) {
	reqBody := models.CreateChatRoomRequest{
		OrderID:  orderID,
		BuyerID:  buyerID,
		RunnerID: runnerID,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/chat/rooms",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return "", fmt.Errorf("failed to create chat room: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("chat service returned status %d", resp.StatusCode)
	}

	var respBody models.CreateChatRoomResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return respBody.ChatRoomID, nil
}

// CloseChatRoom closes an existing chat room
func (c *ChatClient) CloseChatRoom(chatRoomID string) error {
	req, err := http.NewRequest(
		http.MethodPut,
		fmt.Sprintf("%s/chat/rooms/%s/close", c.baseURL, chatRoomID),
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to close chat room: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("chat service returned status %d", resp.StatusCode)
	}

	return nil
}
