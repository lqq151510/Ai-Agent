package com.agent.mvp.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ImportPreflightRequest(
        @NotEmpty(message = "contentHashes must contain 1 to 20 SHA-256 hashes")
                @Size(max = 20, message = "contentHashes must contain at most 20 SHA-256 hashes")
                List<
                                @NotBlank(message = "content hash is required")
                                @Pattern(
                                        regexp = "^[0-9a-fA-F]{64}$",
                                        message =
                                                "content hash must be a 64-character hexadecimal"
                                                        + " SHA-256")
                                String>
                        contentHashes) {}
