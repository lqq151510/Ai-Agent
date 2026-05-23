package com.agent.cli.cmd;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ReplCommandTest {

    @Test
    void testTokenizeBasic() {
        ReplCommand repl = new ReplCommand();
        String[] tokens = repl.tokenize("chat --message hello");
        assertArrayEquals(new String[]{"chat", "--message", "hello"}, tokens);
    }

    @Test
    void testTokenizeQuotes() {
        ReplCommand repl = new ReplCommand();
        String[] tokens = repl.tokenize("chat --message \"hello world\" --session 'some-session-id'");
        assertArrayEquals(new String[]{"chat", "--message", "hello world", "--session", "some-session-id"}, tokens);
    }

    @Test
    void testTokenizeSpaces() {
        ReplCommand repl = new ReplCommand();
        String[] tokens = repl.tokenize("   chat      --message   \"hello\"   ");
        assertArrayEquals(new String[]{"chat", "--message", "hello"}, tokens);
    }
}
