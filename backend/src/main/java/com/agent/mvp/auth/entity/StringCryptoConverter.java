package com.agent.mvp.auth.entity;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StringCryptoConverter {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LEN = 12;
    private static final int GCM_TAG_LEN = 128;

    private final byte[] key;

    public StringCryptoConverter(
            @Value("${security.db.encryption-key:12345678901234567890123456789012}")
                    String configuredKey) {
        // Pad or truncate to 32 bytes for AES-256
        String padded = String.format("%-32s", configuredKey).substring(0, 32);
        this.key = padded.getBytes(StandardCharsets.UTF_8);
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

            // Prepend IV to ciphertext
            byte[] ivAndCiphertext = new byte[GCM_IV_LEN + encrypted.length];
            System.arraycopy(iv, 0, ivAndCiphertext, 0, GCM_IV_LEN);
            System.arraycopy(encrypted, 0, ivAndCiphertext, GCM_IV_LEN, encrypted.length);
            return Base64.getEncoder().encodeToString(ivAndCiphertext);
        } catch (Exception e) {
            throw new RuntimeException("Error encrypting db attribute", e);
        }
    }

    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        try {
            byte[] ivAndCiphertext = Base64.getDecoder().decode(dbData);
            byte[] iv = new byte[GCM_IV_LEN];
            byte[] ciphertext = new byte[ivAndCiphertext.length - GCM_IV_LEN];
            System.arraycopy(ivAndCiphertext, 0, iv, 0, GCM_IV_LEN);
            System.arraycopy(ivAndCiphertext, GCM_IV_LEN, ciphertext, 0, ciphertext.length);

            Key aesKey = new SecretKeySpec(key, "AES");
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LEN, iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, gcmSpec);
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // If it fails to decrypt, it might be unencrypted plaintext from before this feature
            // was added
            return dbData;
        }
    }
}
