# Backend Architect Task: Secure Authentication System Design

## Project Context
You are working on a Next.js application at `/Users/don/Gesture Generator/gesture_generator/gesture-generator-next/` that needs a secure authentication system redesign.

## Current Issues to Address
1. **Service Key Misuse**: Currently using `serviceKey` instead of `anonKey` in client-side code (major security vulnerability)
2. **Custom JWT Implementation**: Using custom JWT tokens instead of Supabase's built-in auth
3. **No RLS Policies**: Direct database access without Row Level Security
4. **No Rate Limiting**: APIs vulnerable to brute force attacks
5. **No Input Validation**: Missing proper input validation on auth endpoints

## Current Implementation Files
- `/src/app/api/auth/login/route.ts` - Login endpoint using serviceKey
- `/src/app/api/auth/register/route.ts` - Registration endpoint
- `/src/app/api/auth/me/route.ts` - Current user endpoint
- `/src/lib/api/auth.ts` - Custom JWT authentication helpers
- `/src/lib/config/env.ts` - Environment configuration

## Requirements
Design a secure authentication system that:
1. Uses Supabase Auth properly with anonKey for client-side operations
2. Implements proper RLS policies for user data isolation
3. Includes rate limiting middleware design
4. Provides secure session management
5. Supports both email/password and potential OAuth providers
6. Includes proper error handling without information leakage

## Expected Deliverables
1. Authentication architecture diagram showing client-server-database flow
2. API endpoint specifications with security considerations
3. Supabase RLS policy definitions
4. Session management strategy (cookies vs localStorage)
5. Rate limiting approach and configuration
6. Migration plan from current system to new architecture

Please analyze the existing code and provide a comprehensive secure authentication design.