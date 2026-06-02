package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import com.agent.cli.client.CliStateStore;
import com.agent.cli.model.AuthState;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.UserInterruptException;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import picocli.CommandLine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@CommandLine.Command(name = "repl", description = "Start interactive REPL shell mode (Claude Code style)")
public class ReplCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @Override
    public void run() {
        System.out.println("Entering AI Agent Interactive Shell.");
        System.out.println("Commands starting with '/' are system commands (e.g., /sessions, /create-session, /exit).");
        System.out.println("Other inputs are treated as chat messages to the active session.");

        CliStateStore store = new CliStateStore(root.objectMapper());

        try {
            Terminal terminal = TerminalBuilder.builder().system(true).build();
            LineReader lineReader = LineReaderBuilder.builder()
                    .terminal(terminal)
                    .build();

            CommandLine cmd = new CommandLine(root);

            while (true) {
                AuthState state = store.read();
                String prompt = state.getActiveSessionId() != null
                        ? "\u001B[32m" + state.getActiveSessionId().substring(0, 8) + "\u001B[0m> "
                        : "\u001B[33magent-cli\u001B[0m> ";

                String line;
                try {
                    line = lineReader.readLine(prompt);
                } catch (UserInterruptException | EndOfFileException e) {
                    break;
                }

                line = line.trim();
                if (line.isEmpty()) {
                    continue;
                }

                if (line.equalsIgnoreCase("/exit") || line.equalsIgnoreCase("/quit")) {
                    break;
                }

                if (line.startsWith("/")) {
                    // System command
                    String commandLine = line.substring(1);
                    String[] args = tokenize(commandLine);
                    try {
                        cmd.execute(args);
                    } catch (Exception e) {
                        System.err.println("Error executing command: " + e.getMessage());
                    }
                } else {
                    // Chat message
                    if (state.getActiveSessionId() == null || state.getActiveSessionId().isBlank()) {
                        System.err.println("No active session! Please use '/create-session <title>' or '/sessions' to select one.");
                        continue;
                    }

                    // Call stream-chat
                    String[] args = {"stream-chat", "--message", line};
                    try {
                        cmd.execute(args);
                    } catch (Exception e) {
                        System.err.println("Chat error: " + e.getMessage());
                    }
                }
            }
            System.out.println("Goodbye!");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public String[] tokenize(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean insideQuotes = false;
        char quoteChar = 0;

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (insideQuotes) {
                if (c == quoteChar) {
                    insideQuotes = false;
                } else {
                    sb.append(c);
                }
            } else {
                if (c == '\'' || c == '"') {
                    insideQuotes = true;
                    quoteChar = c;
                } else if (Character.isWhitespace(c)) {
                    if (sb.length() > 0) {
                        tokens.add(sb.toString());
                        sb.setLength(0);
                    }
                } else {
                    sb.append(c);
                }
            }
        }
        if (sb.length() > 0) {
            tokens.add(sb.toString());
        }
        return tokens.toArray(new String[0]);
    }
}
