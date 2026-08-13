# Mindful Trim (Ojas) - Wellness Mobile App

## Overview
A wellness mobile app where users spend 2 minutes per day aligning one pillar of life: Mental, Physical, Social, or Spiritual. Each day the user chooses a pillar and receives one randomized exercise from that pillar they haven't previously received.

## Tech Stack
- **Frontend**: React Native (Expo), Expo Router (file-based routing)
- **Backend**: Express.js with dual auth (session cookies + JWT Bearer tokens), PostgreSQL via Drizzle ORM
- **Database**: PostgreSQL (users, user_state, exercise_history, daily_logs, password_reset_tokens tables)
- **Email**: Nodemailer via Gmail SMTP (set SMTP_USER + SMTP_PASS secrets to enable)
- **UI**: expo-linear-gradient, expo-haptics, react-native-reanimated

## Project Structure
```
app/
  _layout.tsx          # Root layout with providers (Auth, App, Query)
  index.tsx            # Redirect based on auth state
  welcome.tsx          # Welcome/landing screen
  login.tsx            # Email/password login
  register.tsx         # Account registration
  onboarding.tsx       # 4-step onboarding (identity, gender, tone, compass)
  checkin.tsx          # Pre-exercise mood & context check-in
  exercise.tsx         # Exercise timer and display
  completion.tsx       # Post-exercise celebration + artifact unlock
  (main)/
    _layout.tsx        # Tab navigation (Home, Gallery, Profile)
    index.tsx          # Home screen with pillar cards
    gallery.tsx        # Milestone artifacts gallery
    profile.tsx        # User profile and stats

components/
  ScreenContainer.tsx  # Safe-area wrapper with gradient support
  PrimaryButton.tsx    # Reusable button (filled, outline, ghost)
  PillarCard.tsx       # Pillar selection card with gradient
  MoodSlider.tsx       # Mood selection (5 faces)
  ContextTags.tsx      # Context tag selector
  ExerciseCard.tsx     # Exercise display card
  CooldownTimer.tsx    # Date-based cooldown (resets at midnight)
  ErrorBoundary.tsx    # Error boundary wrapper
  ErrorFallback.tsx    # Error fallback UI

context/
  AuthContext.tsx       # Authentication via API (register, login, logout, onboarding)
  AppContext.tsx        # App state via API (exercises, history, logs, artifacts)
  ThemeContext.tsx      # Theme system (light/dark/contrast), persisted to AsyncStorage

server/
  index.ts             # Express server setup, CORS, Expo routing
  routes.ts            # API routes with session auth (auth, state, logs, history)
  storage.ts           # PostgreSQL storage layer via Drizzle ORM
  db.ts                # Database connection (Drizzle + pg pool)

shared/
  schema.ts            # Drizzle schema (users, user_state, exercise_history, daily_logs)

data/
  exercises.ts         # 100 exercises across 4 pillars
  artifacts.ts         # 10 milestone artifacts (every 7 days)

constants/
  colors.ts            # Pillar icons and legacy color definitions (use ThemeContext instead)
```

## Database Schema
- **users**: id, email, password_hash, identity, gender, tone_preference, compass, is_onboarded
- **user_state**: user_id, total_days_aligned, last_completed_timestamp, last_completed_date, last_pillar
- **exercise_history**: user_id, pillar, used_exercise_ids (JSONB)
- **daily_logs**: user_id, date, pillar, exercise_id, exercise_name, mood_before, context_tags (JSONB), completed_at

## API Routes
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- PUT /api/auth/onboarding, PUT /api/auth/profile
- GET /api/state, PUT /api/state
- GET /api/logs, POST /api/logs
- GET /api/history, PUT /api/history

## Key Features
- Server-side auth with express-session (PostgreSQL session store)
- 4-step onboarding (identity, gender, tone preference, compass)
- Habit engine with no-repeat randomization per pillar
- Date-based cooldown (resets at local midnight)
- Mood + context tag check-in before exercises
- Countdown timer with breathing animation (3-3-3 breathe cycle)
- Personalized post-exercise messages based on mood + context tags
- Milestone artifacts unlocked every 7 days (gallery screen)
- Year map heatmap of activity
- XP and level progression system with level-up celebration
- Daily reminder notifications (not supported in Expo Go)
- Pillar breakdown stats on profile
- Light/Dark/High-Contrast theme picker on profile (persisted to AsyncStorage)
- Multi-language support (English + Hindi) via i18next

## Play Store Configuration
- Package: com.mindfultrim.ojas
- Version: 1.0.0 (versionCode: 1)
- Adaptive icon: foreground 1024×1024, background cream #F2EDE0
- Splash screen: cream #F2EDE0 background
- Permissions: VIBRATE only
- Privacy policy + terms served from backend (/privacy, /terms)

## Theme System
- `useThemeColors()` returns current theme's `ThemeColors` object
- `usePillarColors()` returns theme-aware pillar color map (main/light per pillar)
- `useTheme()` returns `{ theme, setTheme }` for switching themes
- `pillarIcons` re-exported from ThemeContext (static, not theme-dependent)
- All screens use `makeStyles(Colors: ThemeColors)` pattern
- Themes: light (#FAF8F5 bg), dark (#121218 bg), contrast (#000000 bg)

## Pillar Colors
- Mental: #5B8DEF (blue)
- Physical: #56C596 (green)
- Social: #F2836B (coral)
- Spiritual: #9B7DD4 (violet)

## Workflows
- `Start Backend`: Express server on port 5000
- `Start Frontend`: Expo dev server on port 8081

## User Preferences
- Physical device is not working properly — verify changes using the Expo web preview and log analysis instead of asking the user to test on device.
