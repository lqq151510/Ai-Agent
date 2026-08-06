package com.agent.mvp.auth.entity;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StringCryptoConverter {

    private static final Logger log = LoggerFactory.getLogger(StringCryptoConverter.class);
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LEN = 12;
    private static final int GCM_TAG_LEN = 128;
    private static final String CIPHERTEXT_PREFIX = "ENC:";

    private final byte[] key;
    private final byte[] legacyKey;

    public StringCryptoConverter(
            @Value("${security.db.encryption-key}") String configuredKey,
            @Value("${security.db.legacy-encryption-key:}") String legacyKeyRaw) {
        this.key = padKey(configuredKey);
        this.legacyKey = legacyKeyRaw.isBlank() ? null : padKey(legacyKeyRaw);
    }

    private static byte[] padKey(String raw) {
        return String.format("%-32s", raw).substring(0, 32).getBytes(StandardCharsets.UTF_8);
    }

    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null) return null;
        try {
            Key aesKey = new SecretKeySpec(key, "AES");
            byte[] iv = new byte[GCM_IV_LEN];
            new SecureRandom().nextBytes(iv);
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LEN, iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, aesKey, gcmSpec);
            byte[] encrypted = cipher.doFinal(attribute.getBytes(StandardCharsets.UTF_8));

            byte[] ivAndCiphertext = new byte[GCM_IV_LEN + encrypted.length];
            System.arraycopy(iv, 0, ivAndCiphertext, 0, GCM_IV_LEN);
            System.arraycopy(encrypted, 0, ivAndCiphertext, GCM_IV_LEN, encrypted.length);
            return CIPHERTEXT_PREFIX + Base64.getEncoder().encodeToString(ivAndCiphertext);
        } catch (Exception e) {
            throw new RuntimeException("Error encrypting db attribute", e);
        }
    }

    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;

        if (isEncrypted(dbData)) {
            String payload = dbData.substring(CIPHERTEXT_PREFIX.length());
            String currentResult = tryDecrypt(payload, key);
            if (currentResult != null) return currentResult;
            if (legacyKey != null) {
                String legacyResult = tryDecrypt(payload, legacyKey);
                if (legacyResult != null) return legacyResult;
            }
            log.error(
                    "Failed to decrypt database column. Set security.db.legacy-encryption-key "
                            + "when rotating database encryption keys.");
            throw new IllegalStateException(
                    "Database decryption failed — encryption key mismatch detected");
        }

        // No ENC: prefix — could be legacy ciphertext (from before prefix was added) or genuine
        // plaintext.
        // Try legacy key first if configured, then try current key as fallback for old-format
        // ciphertext.
        if (legacyKey != null) {
            String legacyResult = tryDecrypt(dbData, legacyKey);
            if (legacyResult != null) return legacyResult;
        }
        String currentKeyResult = tryDecrypt(dbData, key);
        if (currentKeyResult != null) return currentKeyResult;

        // Genuine plaintext (from before encryption was introduced) — return as-is.
        return dbData;
    }

    /**
     * Attempt to decrypt a legacy ciphertext (no ENC: prefix) with the given key. Returns the
     * plaintext on success, or null if the value is not valid Base64 or decryption fails
     * (indicating genuine plaintext).
     */
    private String tryDecrypt(String dbData, byte[] keyBytes) {
        try {
            byte[] ivAndCiphertext = Base64.getDecoder().decode(dbData);
            if (ivAndCiphertext.length <= GCM_IV_LEN) return null;

            byte[] iv = new byte[GCM_IV_LEN];
            byte[] ciphertext = new byte[ivAndCiphertext.length - GCM_IV_LEN];
            System.arraycopy(ivAndCiphertext, 0, iv, 0, GCM_IV_LEN);
            System.arraycopy(ivAndCiphertext, GCM_IV_LEN, ciphertext, 0, ciphertext.length);

            Key aesKey = new SecretKeySpec(keyBytes, "AES");
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LEN, iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, gcmSpec);
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // The caller distinguishes malformed prefixed ciphertext from legacy plaintext.
            return null;
        }
    }

    private boolean isEncrypted(String dbData) {
        return dbData.startsWith(CIPHERTEXT_PREFIX);
    }
}
