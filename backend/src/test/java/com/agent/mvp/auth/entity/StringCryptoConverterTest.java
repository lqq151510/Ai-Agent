package com.agent.mvp.auth.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class StringCryptoConverterTest {

    private static final String CURRENT_KEY = "current-encryption-key-0123456789";
    private static final String LEGACY_KEY = "legacy-encryption-key-0123456789";

    @Test
    void roundTripsNewPrefixedCiphertext() {
        StringCryptoConverter converter = new StringCryptoConverter(CURRENT_KEY, "");

        String ciphertext = converter.convertToDatabaseColumn("sk-current");

        assertTrue(ciphertext.startsWith("ENC:"));
        assertEquals("sk-current", converter.convertToEntityAttribute(ciphertext));
    }

    @Test
    void decryptsOldUnprefixedCiphertextWithLegacyKey() throws Exception {
        StringCryptoConverter converter = new StringCryptoConverter(CURRENT_KEY, LEGACY_KEY);

        String oldCiphertext = encryptLegacy("sk-legacy", LEGACY_KEY);

        assertEquals("sk-legacy", converter.convertToEntityAttribute(oldCiphertext));
    }

    @Test
    void decryptsPrefixedCiphertextAfterKeyRotation() {
        StringCryptoConverter oldConverter = new StringCryptoConverter(LEGACY_KEY, "");
        String oldCiphertext = oldConverter.convertToDatabaseColumn("sk-before-rotation");
        StringCryptoConverter rotatedConverter = new StringCryptoConverter(CURRENT_KEY, LEGACY_KEY);

        assertEquals(
                "sk-before-rotation", rotatedConverter.convertToEntityAttribute(oldCiphertext));
    }

    @Test
    void keepsGenuinePlaintextAndRejectsDamagedPrefixedCiphertext() {
        StringCryptoConverter converter = new StringCryptoConverter(CURRENT_KEY, "");

        assertEquals("plain-api-key", converter.convertToEntityAttribute("plain-api-key"));
        assertThrows(
                IllegalStateException.class,
                () -> converter.convertToEntityAttribute("ENC:not-base64"));
    }

    private static String encryptLegacy(String plaintext, String rawKey) throws Exception {
        byte[] key =
                String.format("%-32s", rawKey).substring(0, 32).getBytes(StandardCharsets.UTF_8);
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
                Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, payload, 0, iv.length);
        System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
        return Base64.getEncoder().encodeToString(payload);
    }
}
