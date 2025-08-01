#!/bin/bash

# Comprehensive Monitoring and Observability Setup Script
# Sets up monitoring stack for Claude CLI Web UI serverless architecture

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
PROJECT_NAME="claude-cli-web-ui"
MONITORING_STACK=${2:-"comprehensive"}

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check required tools
    local tools=("curl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is not installed. Please install it first."
            exit 1
        fi
    done
    
    success "Prerequisites check passed"
}

# Setup Vercel Analytics integration
setup_vercel_analytics() {
    log "Setting up Vercel Analytics integration..."
    
    cat > "vercel-analytics-config.json" << EOF
{
    "analytics": {
        "enabled": true,
        "provider": "vercel",
        "configuration": {
            "web_vitals": true,
            "custom_events": true,
            "real_user_monitoring": true,
            "performance_monitoring": true
        },
        "metrics": {
            "core_web_vitals": {
                "first_contentful_paint": true,
                "largest_contentful_paint": true,
                "first_input_delay": true,
                "cumulative_layout_shift": true
            },
            "custom_metrics": {
                "api_response_time": true,
                "task_execution_time": true,
                "queue_processing_time": true,
                "terragon_worker_time": true,
                "redis_operation_time": true
            }
        },
        "alerts": {
            "performance_threshold": 3000,
            "error_rate_threshold": 5,
            "availability_threshold": 99.9
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Vercel Analytics configuration created"
}

# Setup Sentry error tracking
setup_sentry_config() {
    log "Setting up Sentry error tracking configuration..."
    
    cat > "sentry-config.json" << EOF
{
    "sentry": {
        "enabled": true,
        "environment": "$ENVIRONMENT",
        "configuration": {
            "release_tracking": true,
            "performance_monitoring": true,
            "error_tracking": true,
            "user_feedback": false,
            "session_replay": $([ "$ENVIRONMENT" == "production" ] && echo "false" || echo "true")
        },
        "sampling": {
            "traces_sample_rate": $([ "$ENVIRONMENT" == "production" ] && echo "0.1" || echo "1.0"),
            "profiles_sample_rate": $([ "$ENVIRONMENT" == "production" ] && echo "0.1" || echo "1.0"),
            "replay_sample_rate": $([ "$ENVIRONMENT" == "production" ] && echo "0.01" || echo "0.1")
        },
        "integrations": {
            "tracing": {
                "fetch": true,
                "xhr": true,
                "browser_tracing": true,
                "react": true
            },
            "logging": {
                "console": true,
                "breadcrumbs": true,
                "context": true
            }
        },
        "filters": {
            "ignore_errors": [
                "Non-Error exception captured",
                "ResizeObserver loop limit exceeded",
                "NetworkError",
                "ChunkLoadError"
            ],
            "ignore_transactions": [
                "/health",
                "/favicon.ico"
            ]
        },
        "alerts": {
            "error_threshold": 10,
            "performance_threshold": 5000,
            "notification_channels": ["email", "slack"]
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Sentry configuration created"
}

# Setup uptime monitoring
setup_uptime_monitoring() {
    log "Setting up uptime monitoring configuration..."
    
    cat > "uptime-monitoring-config.json" << EOF
{
    "uptime_monitoring": {
        "enabled": true,
        "provider": "multiple",
        "endpoints": [
            {
                "name": "main_application",
                "url": "https://claude-cli.vercel.app",
                "method": "GET",
                "expected_status": 200,
                "check_interval": 60,
                "timeout": 10000,
                "locations": ["us-east-1", "eu-west-1", "ap-southeast-1"]
            },
            {
                "name": "health_endpoint",
                "url": "https://claude-cli.vercel.app/api/health",
                "method": "GET",
                "expected_status": 200,
                "expected_body": "healthy",
                "check_interval": 30,
                "timeout": 5000,
                "locations": ["us-east-1", "eu-west-1"]
            },
            {
                "name": "auth_endpoint",
                "url": "https://claude-cli.vercel.app/api/auth/me",
                "method": "GET",
                "expected_status": 401,
                "check_interval": 300,
                "timeout": 5000,
                "locations": ["us-east-1"]
            },
            {
                "name": "tasks_api",
                "url": "https://claude-cli.vercel.app/api/tasks",
                "method": "GET",
                "expected_status": 401,
                "check_interval": 300,
                "timeout": 5000,
                "locations": ["us-east-1"]
            }
        ],
        "alerts": {
            "consecutive_failures": 3,
            "notification_delay": 300,
            "escalation_delay": 900,
            "channels": {
                "email": true,
                "slack": true,
                "sms": $([ "$ENVIRONMENT" == "production" ] && echo "true" || echo "false")
            }
        },
        "status_page": {
            "enabled": true,
            "public": true,
            "custom_domain": "status.claude-cli.com"
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Uptime monitoring configuration created"
}

# Setup application performance monitoring
setup_apm_config() {
    log "Setting up Application Performance Monitoring configuration..."
    
    cat > "apm-config.json" << EOF
{
    "apm": {
        "enabled": true,
        "providers": {
            "primary": "sentry",
            "secondary": "vercel"
        },
        "metrics": {
            "response_time": {
                "enabled": true,
                "percentiles": [50, 90, 95, 99],
                "alert_threshold": 5000
            },
            "throughput": {
                "enabled": true,
                "unit": "requests_per_minute",
                "alert_threshold": 1000
            },
            "error_rate": {
                "enabled": true,
                "unit": "percentage",
                "alert_threshold": 5
            },
            "apdex": {
                "enabled": true,
                "target": 1000,
                "tolerance": 4000
            }
        },
        "tracing": {
            "enabled": true,
            "sample_rate": $([ "$ENVIRONMENT" == "production" ] && echo "0.1" || echo "1.0"),
            "services": {
                "frontend": {
                    "name": "claude-cli-frontend",
                    "framework": "react",
                    "monitoring": ["page_loads", "user_interactions", "api_calls"]
                },
                "backend": {
                    "name": "claude-cli-backend",
                    "framework": "vercel",
                    "monitoring": ["api_endpoints", "database_queries", "external_apis"]
                },
                "redis": {
                    "name": "upstash-redis",
                    "monitoring": ["operations", "latency", "memory_usage"]
                },
                "terragon": {
                    "name": "terragon-workers",
                    "monitoring": ["deployments", "executions", "callbacks"]
                }
            }
        },
        "custom_metrics": {
            "business_metrics": {
                "tasks_created": {
                    "type": "counter",
                    "description": "Total number of tasks created"
                },
                "tasks_completed": {
                    "type": "counter",
                    "description": "Total number of tasks completed successfully"
                },
                "tasks_failed": {
                    "type": "counter",
                    "description": "Total number of tasks that failed"
                },
                "queue_length": {
                    "type": "gauge",
                    "description": "Current number of tasks in queue"
                },
                "active_users": {
                    "type": "gauge",
                    "description": "Number of currently active users"
                }
            },
            "technical_metrics": {
                "github_api_calls": {
                    "type": "counter",
                    "description": "Number of GitHub API calls made"
                },
                "redis_operations": {
                    "type": "counter",
                    "description": "Number of Redis operations performed"
                },
                "terragon_worker_invocations": {
                    "type": "counter",
                    "description": "Number of Terragon worker invocations"
                }
            }
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "APM configuration created"
}

# Setup log aggregation
setup_log_aggregation() {
    log "Setting up log aggregation configuration..."
    
    cat > "log-aggregation-config.json" << EOF
{
    "logging": {
        "enabled": true,
        "level": "$([ "$ENVIRONMENT" == "production" ] && echo "info" || echo "debug")",
        "structured": true,
        "format": "json",
        "sources": {
            "vercel_functions": {
                "enabled": true,
                "retention_days": $([ "$ENVIRONMENT" == "production" ] && echo "30" || echo "7"),
                "log_level": "info"
            },
            "vercel_edge": {
                "enabled": true,
                "retention_days": $([ "$ENVIRONMENT" == "production" ] && echo "30" || echo "7"),
                "log_level": "warn"
            },
            "application": {
                "enabled": true,
                "retention_days": $([ "$ENVIRONMENT" == "production" ] && echo "30" || echo "7"),
                "log_level": "$([ "$ENVIRONMENT" == "production" ] && echo "info" || echo "debug")"
            },
            "redis_operations": {
                "enabled": true,
                "retention_days": 14,
                "log_level": "info"
            },
            "terragon_workers": {
                "enabled": true,
                "retention_days": 14,
                "log_level": "info"
            }
        },
        "processors": {
            "correlation_id_injection": true,
            "user_context_enrichment": true,
            "error_classification": true,
            "sensitive_data_masking": true
        },
        "alerts": {
            "error_spike": {
                "enabled": true,
                "threshold": 10,
                "window": 300
            },
            "warning_spike": {
                "enabled": true,
                "threshold": 50,
                "window": 300
            },
            "custom_patterns": [
                {
                    "name": "authentication_failures",
                    "pattern": "authentication.*failed",
                    "threshold": 5,
                    "window": 60
                },
                {
                    "name": "api_rate_limit",
                    "pattern": "rate.limit.*exceeded",
                    "threshold": 3,
                    "window": 60
                }
            ]
        },
        "exports": {
            "sentry": true,
            "datadog": false,
            "cloudwatch": false,
            "elasticsearch": false
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Log aggregation configuration created"
}

# Setup alerting rules
setup_alerting() {
    log "Setting up alerting rules configuration..."
    
    cat > "alerting-config.json" << EOF
{
    "alerting": {
        "enabled": true,
        "notification_channels": {
            "email": {
                "enabled": true,
                "recipients": [
                    "alerts@yourdomain.com",
                    "devops@yourdomain.com"
                ],
                "severity_filter": ["critical", "high", "medium"]
            },
            "slack": {
                "enabled": true,
                "webhook_url": "\${SLACK_WEBHOOK_URL}",
                "channel": "#alerts",
                "severity_filter": ["critical", "high"]
            },
            "sms": {
                "enabled": $([ "$ENVIRONMENT" == "production" ] && echo "true" || echo "false"),
                "numbers": ["\${ALERT_PHONE_NUMBER}"],
                "severity_filter": ["critical"]
            },
            "pagerduty": {
                "enabled": $([ "$ENVIRONMENT" == "production" ] && echo "true" || echo "false"),
                "service_key": "\${PAGERDUTY_SERVICE_KEY}",
                "severity_filter": ["critical"]
            }
        },
        "rules": {
            "infrastructure": [
                {
                    "name": "high_error_rate",
                    "description": "Error rate exceeds threshold",
                    "condition": "error_rate > 5%",
                    "severity": "high",
                    "duration": "5m",
                    "cooldown": "15m"
                },
                {
                    "name": "slow_response_time",
                    "description": "Response time exceeds threshold",
                    "condition": "p95_response_time > 5000ms",
                    "severity": "medium",
                    "duration": "10m",
                    "cooldown": "30m"
                },
                {
                    "name": "service_unavailable",
                    "description": "Service is not responding",
                    "condition": "uptime < 99%",
                    "severity": "critical",
                    "duration": "2m",
                    "cooldown": "5m"
                },
                {
                    "name": "redis_connection_failure",
                    "description": "Redis connection issues",
                    "condition": "redis_connection_errors > 10",
                    "severity": "high",
                    "duration": "5m",
                    "cooldown": "15m"
                }
            ],
            "application": [
                {
                    "name": "task_failure_spike",
                    "description": "High number of task failures",
                    "condition": "task_failure_rate > 10%",
                    "severity": "medium",
                    "duration": "10m",
                    "cooldown": "20m"
                },
                {
                    "name": "queue_backlog",
                    "description": "Task queue is backing up",
                    "condition": "queue_length > 100",
                    "severity": "medium",
                    "duration": "15m",
                    "cooldown": "30m"
                },
                {
                    "name": "authentication_failures",
                    "description": "High number of authentication failures",
                    "condition": "auth_failure_rate > 20%",
                    "severity": "high",
                    "duration": "5m",
                    "cooldown": "15m"
                }
            ],
            "business": [
                {
                    "name": "low_user_activity",
                    "description": "User activity is below normal",
                    "condition": "active_users < 10",
                    "severity": "low",
                    "duration": "30m",
                    "cooldown": "60m"
                },
                {
                    "name": "zero_task_completion",
                    "description": "No tasks completed in the last hour",
                    "condition": "tasks_completed_1h == 0",
                    "severity": "medium",
                    "duration": "60m",
                    "cooldown": "60m"
                }
            ]
        },
        "escalation": {
            "enabled": true,
            "levels": [
                {
                    "level": 1,
                    "delay": 0,
                    "channels": ["slack"]
                },
                {
                    "level": 2,
                    "delay": 900,
                    "channels": ["email", "slack"]
                },
                {
                    "level": 3,
                    "delay": 1800,
                    "channels": ["email", "slack", "sms", "pagerduty"]
                }
            ]
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Alerting configuration created"
}

# Setup dashboard configuration
setup_dashboards() {
    log "Setting up monitoring dashboards configuration..."
    
    cat > "dashboards-config.json" << EOF
{
    "dashboards": {
        "enabled": true,
        "provider": "grafana_cloud",
        "dashboards": {
            "overview": {
                "name": "Claude CLI - System Overview",
                "description": "High-level system metrics and health",
                "panels": [
                    {
                        "title": "Request Rate",
                        "type": "graph",
                        "metrics": ["requests_per_minute", "success_rate", "error_rate"]
                    },
                    {
                        "title": "Response Time",
                        "type": "graph",
                        "metrics": ["p50_response_time", "p95_response_time", "p99_response_time"]
                    },
                    {
                        "title": "System Health",
                        "type": "stat",
                        "metrics": ["uptime", "active_instances", "cpu_usage", "memory_usage"]
                    },
                    {
                        "title": "Queue Status",
                        "type": "graph",
                        "metrics": ["queue_length", "processing_rate", "completion_rate"]
                    }
                ]
            },
            "application": {
                "name": "Claude CLI - Application Metrics",
                "description": "Application-specific metrics and performance",
                "panels": [
                    {
                        "title": "Task Metrics",
                        "type": "graph",
                        "metrics": ["tasks_created", "tasks_completed", "tasks_failed", "task_duration"]
                    },
                    {
                        "title": "User Activity",
                        "type": "graph",
                        "metrics": ["active_users", "new_sessions", "page_views"]
                    },
                    {
                        "title": "API Performance",
                        "type": "heatmap",
                        "metrics": ["api_response_times_by_endpoint"]
                    },
                    {
                        "title": "Error Analysis",
                        "type": "table",
                        "metrics": ["errors_by_type", "errors_by_endpoint", "error_trends"]
                    }
                ]
            },
            "infrastructure": {
                "name": "Claude CLI - Infrastructure",
                "description": "Infrastructure and external service metrics",
                "panels": [
                    {
                        "title": "Redis Performance",
                        "type": "graph",
                        "metrics": ["redis_operations_per_sec", "redis_latency", "redis_memory_usage"]
                    },
                    {
                        "title": "Terragon Workers",
                        "type": "graph",
                        "metrics": ["worker_invocations", "worker_success_rate", "worker_execution_time"]
                    },
                    {
                        "title": "GitHub API",
                        "type": "stat",
                        "metrics": ["github_api_calls", "github_rate_limit", "github_response_time"]
                    },
                    {
                        "title": "Vercel Functions",
                        "type": "graph",
                        "metrics": ["function_invocations", "function_duration", "function_errors"]
                    }
                ]
            },
            "business": {
                "name": "Claude CLI - Business Metrics",
                "description": "Business and usage analytics",
                "panels": [
                    {
                        "title": "Usage Trends",
                        "type": "graph",
                        "metrics": ["daily_active_users", "weekly_active_users", "monthly_active_users"]
                    },
                    {
                        "title": "Feature Usage",
                        "type": "pie",
                        "metrics": ["feature_usage_by_type", "command_usage_distribution"]
                    },
                    {
                        "title": "Performance SLA",
                        "type": "stat",
                        "metrics": ["uptime_sla", "response_time_sla", "availability_sla"]
                    },
                    {
                        "title": "Cost Analysis",
                        "type": "graph",
                        "metrics": ["vercel_usage_cost", "upstash_usage_cost", "terragon_usage_cost"]
                    }
                ]
            }
        },
        "refresh_interval": "30s",
        "retention_period": "90d",
        "sharing": {
            "public_access": false,
            "team_access": true,
            "external_sharing": false
        }
    },
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Dashboards configuration created"
}

# Generate monitoring documentation
generate_monitoring_docs() {
    log "Generating monitoring documentation..."
    
    cat > "MONITORING.md" << 'EOF'
# Claude CLI Web UI - Monitoring & Observability

## Overview

This document describes the comprehensive monitoring and observability setup for the Claude CLI Web UI serverless application.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                              │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Monitoring    │  Backend Monitoring   │  Infrastructure │
│  ├─ Vercel Analytics   │  ├─ Sentry APM        │  ├─ Uptime Mon.  │
│  ├─ Sentry Browser     │  ├─ Function Logs     │  ├─ Health Checks│
│  ├─ Core Web Vitals    │  ├─ Error Tracking    │  ├─ Redis Mon.   │
│  └─ User Sessions      │  └─ Performance       │  └─ Status Page  │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoring Components

### 1. Vercel Analytics
- **Purpose**: Frontend performance and user experience monitoring
- **Metrics**: Core Web Vitals, page load times, user interactions
- **Configuration**: `vercel-analytics-config.json`

### 2. Sentry Error Tracking
- **Purpose**: Error tracking and performance monitoring
- **Features**: Real-time error alerts, performance tracing, release tracking
- **Configuration**: `sentry-config.json`

### 3. Uptime Monitoring
- **Purpose**: Service availability and endpoint health monitoring
- **Checks**: Main app, API endpoints, health checks
- **Configuration**: `uptime-monitoring-config.json`

### 4. Application Performance Monitoring (APM)
- **Purpose**: Detailed application performance insights
- **Metrics**: Response times, throughput, error rates, Apdex
- **Configuration**: `apm-config.json`

### 5. Log Aggregation
- **Purpose**: Centralized logging and log analysis
- **Sources**: Vercel functions, application logs, Redis operations
- **Configuration**: `log-aggregation-config.json`

## Key Metrics

### Performance Metrics
- **Response Time**: P50, P90, P95, P99 percentiles
- **Throughput**: Requests per minute/second
- **Error Rate**: Percentage of failed requests
- **Apdex Score**: User satisfaction metric

### Business Metrics
- **Tasks Created**: Total number of tasks created
- **Tasks Completed**: Successfully completed tasks
- **Queue Length**: Current number of pending tasks
- **Active Users**: Currently active users

### Infrastructure Metrics
- **Redis Operations**: Operations per second, latency
- **Terragon Workers**: Invocations, success rate, execution time
- **GitHub API**: API calls, rate limits, response times

## Alerting

### Alert Channels
1. **Email**: For medium and high severity alerts
2. **Slack**: For high and critical alerts
3. **SMS**: For critical alerts (production only)
4. **PagerDuty**: For critical alerts with escalation

### Alert Rules
- **High Error Rate**: > 5% error rate for 5 minutes
- **Slow Response Time**: P95 > 5 seconds for 10 minutes
- **Service Unavailable**: Uptime < 99% for 2 minutes
- **Queue Backlog**: Queue length > 100 for 15 minutes

## Dashboards

### 1. System Overview
- Request rate and success metrics
- Response time percentiles
- System health indicators
- Queue status and processing rates

### 2. Application Metrics
- Task execution metrics
- User activity and engagement
- API performance by endpoint
- Error analysis and trends

### 3. Infrastructure
- Redis performance metrics
- Terragon worker statistics
- GitHub API usage
- Vercel function metrics

### 4. Business Intelligence
- User growth and retention
- Feature usage analytics
- SLA compliance metrics
- Cost analysis and optimization

## Setup Instructions

### 1. Environment Configuration
```bash
# Set required environment variables
export SENTRY_DSN="your-sentry-dsn"
export SLACK_WEBHOOK_URL="your-slack-webhook"
export ALERT_PHONE_NUMBER="your-phone-number"
export PAGERDUTY_SERVICE_KEY="your-pagerduty-key"

# Run monitoring setup
./infrastructure/monitoring-setup.sh production
```

### 2. Vercel Integration
Add these environment variables to your Vercel project:
```bash
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your-analytics-id
SENTRY_DSN=your-sentry-dsn
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

### 3. Dashboard Access
- **Vercel Analytics**: Available in Vercel dashboard
- **Sentry**: https://sentry.io/organizations/your-org/
- **Status Page**: https://status.claude-cli.com

## Troubleshooting

### Common Issues

#### High Error Rate Alert
1. Check Sentry for error details
2. Review recent deployments
3. Check external service status
4. Verify Redis connectivity

#### Slow Response Time
1. Check APM traces in Sentry
2. Review database query performance
3. Check Redis cache hit rates
4. Verify Terragon worker performance

#### Queue Backlog
1. Check Redis queue status
2. Verify Terragon worker availability
3. Review task failure rates
4. Check for stuck tasks

### Emergency Procedures

#### Service Outage
1. Check status page for known issues
2. Review recent deployments
3. Check external dependencies
4. Initiate rollback if necessary

#### Performance Degradation
1. Check APM dashboards
2. Review error logs
3. Scale Terragon workers if needed
4. Clear Redis cache if required

## Maintenance

### Regular Tasks
- Review dashboard metrics weekly
- Update alert thresholds monthly
- Archive old logs quarterly
- Review and update monitoring configs

### Capacity Planning
- Monitor resource usage trends
- Plan for traffic growth
- Update scaling configurations
- Review cost optimization opportunities

## Security Monitoring

### Security Metrics
- Authentication failure rates
- Suspicious login patterns
- API abuse patterns
- Rate limiting triggers

### Security Alerts
- Brute force attack detection
- Unusual traffic patterns
- API key compromise indicators
- Data access anomalies

---

For more information, see the individual configuration files in the `infrastructure/` directory.
EOF
    
    success "Monitoring documentation created: MONITORING.md"
}

# Main execution
main() {
    log "Starting comprehensive monitoring setup for environment: $ENVIRONMENT"
    
    # Create infrastructure directory if it doesn't exist
    mkdir -p "infrastructure"
    cd "infrastructure"
    
    check_prerequisites
    setup_vercel_analytics
    setup_sentry_config
    setup_uptime_monitoring
    setup_apm_config
    setup_log_aggregation
    setup_alerting
    setup_dashboards
    generate_monitoring_docs
    
    success "Monitoring setup completed successfully!"
    
    echo ""
    echo "🎉 Setup Summary"
    echo "=================="
    echo "Environment: $ENVIRONMENT"
    echo "Monitoring Stack: $MONITORING_STACK"
    echo ""
    echo "Configuration files created:"
    ls -la *-config.json 2>/dev/null || echo "No configuration files created"
    echo ""
    echo "📊 Environment Variables needed:"
    echo "================================="
    echo "SENTRY_DSN=your-sentry-dsn"
    echo "SLACK_WEBHOOK_URL=your-slack-webhook"
    echo "ALERT_PHONE_NUMBER=your-phone-number"
    echo "PAGERDUTY_SERVICE_KEY=your-pagerduty-key"
    echo "NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your-analytics-id"
    echo ""
    echo "Next steps:"
    echo "1. Set up Sentry project and get DSN"
    echo "2. Configure Slack webhook for alerts"
    echo "3. Set up uptime monitoring service"
    echo "4. Configure dashboards in your monitoring platform"
    echo "5. Test alerting channels"
    echo "6. Review and customize alert thresholds"
}

# Error handling
trap 'error "Script failed at line $LINENO. Exit code: $?"' ERR

# Signal handling
trap 'log "Script interrupted. Cleaning up..."; exit 130' INT TERM

# Execute main function
main "$@"