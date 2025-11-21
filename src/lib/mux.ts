import Mux from "@mux/mux-node";

/**
 * Validate Mux credentials by making a simple API call
 * Returns true if credentials are valid, false otherwise
 */
export async function validateCredentials(
  tokenId: string,
  tokenSecret: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Initialize Mux client with the provided credentials
    const mux = new Mux({
      tokenId,
      tokenSecret,
    });

    // Make a simple API call to verify credentials
    // We'll list assets with a limit of 1 as a lightweight check
    await mux.video.assets.list({ limit: 1 });

    return { valid: true };
  } catch (error) {
    // Check for authentication errors
    if (error instanceof Error) {
      // Mux SDK typically throws errors with status codes
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("401")
      ) {
        return {
          valid: false,
          error: "Invalid credentials. Please check your Token ID and Secret.",
        };
      }

      if (
        errorMessage.includes("forbidden") ||
        errorMessage.includes("403")
      ) {
        return {
          valid: false,
          error: "Access forbidden. Your credentials may not have the required permissions.",
        };
      }

      // Generic error
      return {
        valid: false,
        error: `Failed to validate credentials: ${error.message}`,
      };
    }

    return {
      valid: false,
      error: "An unknown error occurred while validating credentials.",
    };
  }
}
