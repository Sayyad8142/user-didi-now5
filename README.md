# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/2edd991f-3825-445a-9485-006dde036295

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/2edd991f-3825-445a-9485-006dde036295) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Generate assets (recommended for mobile development)
npx capacitor-assets generate --android

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/2edd991f-3825-445a-9485-006dde036295) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Build Android (Play Store)

Before building, ensure you have Android Studio installed, use **Gradle JDK 21** in Android Studio, and `.env.production` configured with production Supabase credentials.

```bash
# 1) Install deps and build web
npm install
npm run build

# 2) Sync native Android project
npx cap sync android

# 3) Open Android Studio
npx cap open android

# 4) Build signed APK/AAB in Android Studio
#    (Build > Generate Signed Bundle/APK)
```

> Never commit machine-specific Android files like `android/local.properties` or `android/.idea/*`.

### Play Console Checklist
- [ ] App icon (512×512) ready
- [ ] Screenshots captured (phone + tablet)
- [ ] Privacy Policy URL live and accessible
- [ ] Data Safety form completed in Play Console
- [ ] Content rating questionnaire completed

See `docs/publish-android.md` for detailed publishing guide.

## Production Deployment

Production deploy: App loads web from https://app.didisnow.com. Make sure the domain is live in Lovable, DNS is pointed, and Supabase Auth redirect URLs include https://app.didisnow.com/*.
