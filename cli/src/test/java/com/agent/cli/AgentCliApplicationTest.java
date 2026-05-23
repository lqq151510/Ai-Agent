package com.agent.cli;

import org.junit.jupiter.api.Test;
import picocli.CommandLine;

import static org.junit.jupiter.api.Assertions.*;

class AgentCliApplicationTest {

    @Test
    void testCommandRegistration() {
        AgentCliApplication root = new AgentCliApplication();
        CommandLine cmd = new CommandLine(root);

        assertNotNull(cmd.getSubcommands().get("login"));
        assertNotNull(cmd.getSubcommands().get("sessions"));
        assertNotNull(cmd.getSubcommands().get("create-session"));
        assertNotNull(cmd.getSubcommands().get("chat"));
        assertNotNull(cmd.getSubcommands().get("stream-chat"));
        assertNotNull(cmd.getSubcommands().get("tool-stats"));
        assertNotNull(cmd.getSubcommands().get("release-report"));
        assertNotNull(cmd.getSubcommands().get("repl"));
    }
}
