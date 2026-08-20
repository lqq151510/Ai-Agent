package com.agent.mvp.agent.service;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.Metadata;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class CodeRAGService {
    private static final Logger log = LoggerFactory.getLogger(CodeRAGService.class);

    private final RAGMemoryService ragMemoryService;

    public CodeRAGService(RAGMemoryService ragMemoryService) {
        this.ragMemoryService = ragMemoryService;
    }

    public void ingestCodeFile(File javaFile) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);
            List<Document> documents = new ArrayList<>();

            cu.findAll(ClassOrInterfaceDeclaration.class)
                    .forEach(
                            clazz -> {
                                String className = clazz.getNameAsString();
                                String classCode = clazz.toString();

                                Map<String, String> metaMap = new HashMap<>();
                                metaMap.put("type", "class");
                                metaMap.put("className", className);
                                metaMap.put("filename", javaFile.getName());

                                Document doc = Document.from(classCode, Metadata.from(metaMap));
                                documents.add(doc);
                            });

            cu.findAll(MethodDeclaration.class)
                    .forEach(
                            method -> {
                                String methodName = method.getNameAsString();
                                // JavaParser 的 findAncestor 仅泛型 varargs 重载未废弃，
                                // 泛型数组创建警告只能在调用处压制
                                @SuppressWarnings("unchecked")
                                Optional<ClassOrInterfaceDeclaration> ancestor =
                                        method.findAncestor(ClassOrInterfaceDeclaration.class);
                                String className =
                                        ancestor
                                                .map(ClassOrInterfaceDeclaration::getNameAsString)
                                                .orElse("Unknown");
                                String methodCode = method.toString();

                                Map<String, String> metaMap = new HashMap<>();
                                metaMap.put("type", "method");
                                metaMap.put("className", className);
                                metaMap.put("methodName", methodName);
                                metaMap.put("filename", javaFile.getName());

                                Document doc = Document.from(methodCode, Metadata.from(metaMap));
                                documents.add(doc);
                            });

            if (!documents.isEmpty()) {
                ragMemoryService.ingestDocuments(documents);
                log.info("Ingested {} components from {}", documents.size(), javaFile.getName());
            }

        } catch (Exception e) {
            log.error("Failed to parse and ingest code file: " + javaFile.getName(), e);
        }
    }

    public List<String> searchRelatedCode(String queryText, int maxResults) {
        // Since RAGMemoryService provides searchSimilarDiagnoses which filters by userId,
        // and code segments don't have a userId, we might need a generic search method in
        // RAGMemoryService.
        // Or we can just use searchSimilarDiagnoses with null userId if it supports it, but let's
        // see.
        // Wait, actually I will add a method to RAGMemoryService to search generic text segments.
        return ragMemoryService.searchCodeContext(queryText, maxResults);
    }
}
