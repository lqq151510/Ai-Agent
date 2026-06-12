package com.agent.mvp.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @Email(message = "Email format is invalid") @NotBlank(message = "Email is required")
                String email,
        @NotBlank(message = "Password is required")
                @Size(min = 8, max = 64, message = "Password length must be between 8 and 64")
                @Pattern(
                        regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\da-zA-Z\\s]).{8,64}$",
                        message =
                                "Password must include upper/lowercase letters, digits and special"
                                        + " characters")
                String password) {}
