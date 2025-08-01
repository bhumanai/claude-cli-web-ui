"""Post-incident security validation test runner and reporter."""

import os
import sys
import subprocess
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Any


class SecurityValidationRunner:
    """Comprehensive security validation test runner for post-incident deployment."""
    
    def __init__(self, base_dir: str = None):
        self.base_dir = Path(base_dir) if base_dir else Path(__file__).parent.parent
        self.report_data = {
            "timestamp": datetime.now().isoformat(),
            "incident_context": "Security credential exposure incident - Production deployment validation",
            "test_categories": {},
            "overall_status": "UNKNOWN",
            "critical_failures": [],
            "warnings": [],
            "recommendations": []
        }
    
    def run_security_test_suite(self) -> Dict[str, Any]:
        """Run the complete security test suite and generate report."""
        print("🔒 Starting Post-Incident Security Validation")
        print("=" * 60)
        
        # Test categories in order of importance
        test_categories = [
            ("credential_rotation", "Credential Rotation Validation", 
             "tests/security/test_credential_rotation_validation.py"),
            ("post_incident", "Post-Incident Security Validation",
             "tests/security/test_post_incident_validation.py"),
            ("deployment", "Production Deployment Validation",
             "tests/deployment/test_production_deployment_validation.py"),
            ("e2e_security", "End-to-End Security Validation",
             "tests/e2e/test_security_e2e_validation.py"),
            ("existing_auth", "Authentication Security Tests",
             "tests/security/test_authentication.py"),
            ("existing_commands", "Command Injection Security Tests",
             "tests/security/test_command_injection.py"),
        ]
        
        all_passed = True
        critical_issues = []
        
        for category_id, category_name, test_file in test_categories:
            print(f"\n🧪 Running {category_name}...")
            print("-" * 40)
            
            result = self._run_test_file(test_file)
            self.report_data["test_categories"][category_id] = {
                "name": category_name,
                "file": test_file,
                "status": result["status"],
                "passed": result["passed"],
                "failed": result["failed"],
                "skipped": result["skipped"],
                "duration": result["duration"],
                "failures": result["failures"]
            }
            
            if result["status"] != "PASSED":
                all_passed = False
                
                # Check for critical security failures
                if category_id in ["credential_rotation", "post_incident", "deployment"]:
                    critical_issues.extend(result["failures"])
        
        # Determine overall status
        if critical_issues:
            self.report_data["overall_status"] = "CRITICAL_FAILURE"
            self.report_data["critical_failures"] = critical_issues
        elif all_passed:
            self.report_data["overall_status"] = "PASSED"
        else:
            self.report_data["overall_status"] = "WARNING"
        
        # Generate recommendations
        self._generate_recommendations()
        
        # Print summary
        self._print_summary()
        
        return self.report_data
    
    def _run_test_file(self, test_file: str) -> Dict[str, Any]:
        """Run a specific test file and parse results."""
        test_path = self.base_dir / test_file
        
        if not test_path.exists():
            print(f"⚠️  Test file not found: {test_file}")
            return {
                "status": "SKIPPED",
                "passed": 0,
                "failed": 0,
                "skipped": 1,
                "duration": 0,
                "failures": [f"Test file not found: {test_file}"]
            }
        
        # Run pytest with JSON output
        start_time = time.time()
        
        try:
            # Change to backend directory for proper imports
            backend_dir = self.base_dir.parent if self.base_dir.name == "tests" else self.base_dir
            
            cmd = [
                sys.executable, "-m", "pytest",
                str(test_path),
                "-v",
                "--tb=short",
                "--json-report",
                "--json-report-file=/tmp/pytest_report.json"
            ]
            
            result = subprocess.run(
                cmd,
                cwd=str(backend_dir),
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            duration = time.time() - start_time
            
            # Parse JSON report if available
            try:
                with open("/tmp/pytest_report.json", "r") as f:
                    json_report = json.load(f)
                
                summary = json_report.get("summary", {})
                passed = summary.get("passed", 0)
                failed = summary.get("failed", 0)
                skipped = summary.get("skipped", 0)
                
                # Extract failure details
                failures = []
                for test in json_report.get("tests", []):
                    if test.get("outcome") == "failed":
                        failures.append({
                            "test": test.get("nodeid", ""),
                            "error": test.get("call", {}).get("longrepr", "")
                        })
                
                status = "PASSED" if failed == 0 else "FAILED"
                
            except (FileNotFoundError, json.JSONDecodeError):
                # Fallback to parsing stdout
                output_lines = result.stdout.split('\n')
                
                passed = failed = skipped = 0
                failures = []
                
                for line in output_lines:
                    if " passed" in line:
                        try:
                            passed = int(line.split()[0])
                        except (ValueError, IndexError):
                            pass
                    elif " failed" in line:
                        try:
                            failed = int(line.split()[0])
                        except (ValueError, IndexError):
                            pass
                    elif " skipped" in line:
                        try:
                            skipped = int(line.split()[0])
                        except (ValueError, IndexError):
                            pass
                    elif "FAILED" in line:
                        failures.append({"test": line, "error": ""})
                
                status = "PASSED" if result.returncode == 0 else "FAILED"
            
            print(f"   ✅ Passed: {passed}, ❌ Failed: {failed}, ⏭️  Skipped: {skipped}")
            print(f"   ⏱️  Duration: {duration:.1f}s")
            
            if failures:
                print(f"   🚨 Failures detected:")
                for failure in failures[:3]:  # Show first 3 failures
                    print(f"      - {failure['test']}")
                if len(failures) > 3:
                    print(f"      ... and {len(failures) - 3} more")
            
            return {
                "status": status,
                "passed": passed,
                "failed": failed,
                "skipped": skipped,
                "duration": duration,
                "failures": failures
            }
            
        except subprocess.TimeoutExpired:
            print(f"   ⏰ Test timeout after 5 minutes")
            return {
                "status": "TIMEOUT",
                "passed": 0,
                "failed": 1,
                "skipped": 0,
                "duration": 300,
                "failures": [{"test": test_file, "error": "Test timeout"}]
            }
        except Exception as e:
            print(f"   💥 Test execution error: {str(e)}")
            return {
                "status": "ERROR",
                "passed": 0,
                "failed": 1,
                "skipped": 0,
                "duration": time.time() - start_time,
                "failures": [{"test": test_file, "error": str(e)}]
            }
    
    def _generate_recommendations(self):
        """Generate security recommendations based on test results."""
        recommendations = []
        
        # Check credential rotation results
        cred_rotation = self.report_data["test_categories"].get("credential_rotation", {})
        if cred_rotation.get("failed", 0) > 0:
            recommendations.append({
                "priority": "CRITICAL",
                "category": "Credential Security",
                "issue": "Credential rotation validation failed",
                "action": "Manually verify all credentials have been rotated and old ones invalidated",
                "details": cred_rotation.get("failures", [])
            })
        
        # Check deployment security
        deployment = self.report_data["test_categories"].get("deployment", {})
        if deployment.get("failed", 0) > 0:
            recommendations.append({
                "priority": "HIGH",
                "category": "Deployment Security",
                "issue": "Production deployment security validation failed",
                "action": "Review deployment configuration and security headers",
                "details": deployment.get("failures", [])
            })
        
        # Check post-incident validation
        post_incident = self.report_data["test_categories"].get("post_incident", {})
        if post_incident.get("failed", 0) > 0:
            recommendations.append({
                "priority": "CRITICAL",
                "category": "Incident Response",
                "issue": "Post-incident security validation failed",
                "action": "Address security vulnerabilities before production deployment",
                "details": post_incident.get("failures", [])
            })
        
        # General recommendations based on overall status
        if self.report_data["overall_status"] == "CRITICAL_FAILURE":
            recommendations.append({
                "priority": "CRITICAL",
                "category": "Deployment Decision",
                "issue": "Critical security failures detected",
                "action": "DO NOT DEPLOY to production until all critical issues are resolved",
                "details": "Review all failed tests and implement fixes"
            })
        elif self.report_data["overall_status"] == "WARNING":
            recommendations.append({
                "priority": "MEDIUM",
                "category": "Deployment Decision", 
                "issue": "Some security tests failed or were skipped",
                "action": "Review failures and determine if deployment should proceed",
                "details": "Consider deploying with enhanced monitoring"
            })
        else:
            recommendations.append({
                "priority": "LOW",
                "category": "Deployment Decision",
                "issue": "All security tests passed",
                "action": "Deployment can proceed with normal monitoring",
                "details": "Continue regular security monitoring post-deployment"
            })
        
        self.report_data["recommendations"] = recommendations
    
    def _print_summary(self):
        """Print comprehensive test summary and recommendations."""
        print("\n" + "=" * 60)
        print("🔒 POST-INCIDENT SECURITY VALIDATION SUMMARY")
        print("=" * 60)
        
        # Overall status
        status_emoji = {
            "PASSED": "✅",
            "WARNING": "⚠️",
            "CRITICAL_FAILURE": "🚨",
            "UNKNOWN": "❓"
        }
        
        status = self.report_data["overall_status"]
        print(f"\n🎯 OVERALL STATUS: {status_emoji.get(status, '❓')} {status}")
        
        # Test category summary
        print(f"\n📊 TEST CATEGORY RESULTS:")
        for category_id, category_data in self.report_data["test_categories"].items():
            status_icon = "✅" if category_data["status"] == "PASSED" else "❌"
            print(f"   {status_icon} {category_data['name']}: "
                  f"{category_data['passed']} passed, "
                  f"{category_data['failed']} failed, "
                  f"{category_data['skipped']} skipped")
        
        # Critical failures
        if self.report_data["critical_failures"]:
            print(f"\n🚨 CRITICAL FAILURES:")
            for failure in self.report_data["critical_failures"][:5]:
                print(f"   💥 {failure.get('test', 'Unknown test')}")
        
        # Recommendations
        print(f"\n📋 SECURITY RECOMMENDATIONS:")
        for rec in self.report_data["recommendations"]:
            priority_emoji = {
                "CRITICAL": "🚨",
                "HIGH": "⚠️",
                "MEDIUM": "ℹ️",
                "LOW": "💡"
            }
            emoji = priority_emoji.get(rec["priority"], "ℹ️")
            print(f"   {emoji} [{rec['priority']}] {rec['category']}: {rec['action']}")
        
        # Deployment decision
        print(f"\n🚀 DEPLOYMENT DECISION:")
        if status == "CRITICAL_FAILURE":
            print("   🛑 DO NOT DEPLOY - Critical security issues must be resolved first")
        elif status == "WARNING":
            print("   ⚠️  PROCEED WITH CAUTION - Review failures and monitor closely")
        elif status == "PASSED":
            print("   ✅ DEPLOYMENT APPROVED - All security validations passed")
        else:
            print("   ❓ MANUAL REVIEW REQUIRED - Unable to determine deployment readiness")
        
        print("\n" + "=" * 60)
    
    def save_report(self, output_file: str = None):
        """Save detailed test report to file."""
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"security_validation_report_{timestamp}.json"
        
        output_path = Path(output_file)
        with open(output_path, 'w') as f:
            json.dump(self.report_data, f, indent=2)
        
        print(f"📄 Detailed report saved to: {output_path.absolute()}")
        return output_path


def main():
    """Main entry point for security validation."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Post-incident security validation")
    parser.add_argument("--base-dir", help="Base directory for tests")
    parser.add_argument("--output", help="Output file for detailed report")
    parser.add_argument("--exit-on-failure", action="store_true", 
                       help="Exit with non-zero code on any failure")
    
    args = parser.parse_args()
    
    runner = SecurityValidationRunner(args.base_dir)
    report = runner.run_security_test_suite()
    
    if args.output:
        runner.save_report(args.output)
    
    # Exit with appropriate code
    if args.exit_on_failure:
        if report["overall_status"] == "CRITICAL_FAILURE":
            sys.exit(1)
        elif report["overall_status"] == "WARNING":
            sys.exit(2)
    
    sys.exit(0)


if __name__ == "__main__":
    main()