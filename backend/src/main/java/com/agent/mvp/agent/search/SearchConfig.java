package com.agent.mvp.agent.search;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 搜索策略配置，绑定 {@code app.search} 前缀的配置项。
 *
 * <p>支持运行时调整搜索模式、置信度阈值、最大策略数和融合算法参数。
 */
@ConfigurationProperties(prefix = "app.search")
public class SearchConfig {

    private SearchMode defaultMode = SearchMode.ADAPTIVE;
    private double confidenceThreshold = 0.5;
    private int maxStrategies = 2;
    private final Fusion fusion = new Fusion();
    private final Strategies strategies = new Strategies();

    public SearchMode getDefaultMode() {
        return defaultMode;
    }

    public void setDefaultMode(SearchMode defaultMode) {
        this.defaultMode = defaultMode;
    }

    public double getConfidenceThreshold() {
        return confidenceThreshold;
    }

    public void setConfidenceThreshold(double confidenceThreshold) {
        this.confidenceThreshold = confidenceThreshold;
    }

    public int getMaxStrategies() {
        return maxStrategies;
    }

    public void setMaxStrategies(int maxStrategies) {
        this.maxStrategies = maxStrategies;
    }

    public Fusion getFusion() {
        return fusion;
    }

    public Strategies getStrategies() {
        return strategies;
    }

    /** 融合算法配置。 */
    public static class Fusion {
        private String algorithm = "RRF";
        private int rrfK = 60;

        public String getAlgorithm() {
            return algorithm;
        }

        public void setAlgorithm(String algorithm) {
            this.algorithm = algorithm;
        }

        public int getRrfK() {
            return rrfK;
        }

        public void setRrfK(int rrfK) {
            this.rrfK = rrfK;
        }
    }

    /** 各策略的启用和权重配置。 */
    public static class Strategies {
        private final Strategy fts = new Strategy();
        private final Strategy vector = new Strategy();

        public Strategy getFts() {
            return fts;
        }

        public Strategy getVector() {
            return vector;
        }
    }

    /** 单个策略的启用状态和权重。 */
    public static class Strategy {
        private boolean enabled = true;
        private double weight = 1.0;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public double getWeight() {
            return weight;
        }

        public void setWeight(double weight) {
            this.weight = weight;
        }
    }
}
