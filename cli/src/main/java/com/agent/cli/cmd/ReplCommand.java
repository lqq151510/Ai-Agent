package com.agent.cli.cmd;

import com.agent.cli.AgentCliApplication;
import picocli.CommandLine;

import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

@CommandLine.Command(name = "repl", description = "Start interactive REPL shell mode")
public class ReplCommand implements Runnable {

    @CommandLine.ParentCommand
    private AgentCliApplication root;

    @Override
    public void run() {
        System.out.println("Entering AI Agent Interactive Shell. Type 'exit' or 'quit' to exit.");
        System.out.println("Available commands: login, sessions, create-session, chat, stream-chat, tool-stats, release-report, exit");

        CommandLine cmd = new CommandLine(root);
        Scanner scanner = new Scanner(System.in);

        while (true) {
            System.out.print("agent-cli> ");
            if (!scanner.hasNextLine()) {
                break;
            }
            String line = scanner.nextLine().trim();
            if (line.isEmpty()) {
                continue;
            }
            if ("exit".equalsIgnoreCase(line) || "quit".equalsIgnoreCase(line)) {
                break;
            }

            String[] args = tokenize(line);
            if (args.length == 0) {
                continue;
            }
            try {
                cmd.execute(args);
            } catch (Exception e) {
                System.err.println("Error: " + e.getMessage());
            }
        }
        System.out.println("Goodbye!");
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
