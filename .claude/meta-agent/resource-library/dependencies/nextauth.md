# NextAuth.js Documentation

## Version: 4.24.5

## Installation
```bash
npm install next-auth@^4.24.5
```

## Basic Setup
```typescript
// pages/api/auth/[...nextauth].ts
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ]
})
```

## Environment Variables
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
```