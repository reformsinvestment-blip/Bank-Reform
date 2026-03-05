# SecureBank Frontend

A full-featured banking frontend built with React + Vite, designed to work with the SecureBank backend API.

## Features

- **Dashboard** – Balance overview, account cards, income/expense chart, recent transactions
- **Accounts** – View all accounts, create new accounts (checking, savings, investment, crypto)
- **Transactions** – Full transaction history with filters by account, type, and date range
- **Transfers** – Local, international, and wire transfers with COT/Tax/IMF codes; saved beneficiaries
- **Cards** – View cards, freeze/unfreeze, request new cards
- **Loans** – Apply for loans with live payment calculator
- **Bills** – Pay bills to any provider, view payment history
- **Crypto** – Live prices, buy/sell crypto, view portfolio
- **Notifications** – View and mark notifications as read
- **Profile** – Update personal info and change password
- **Support** – Submit and track support tickets

## Prerequisites

- Node.js v18+
- The SecureBank backend running on `http://localhost:5000`

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

The app runs on **http://localhost:5173**

The Vite dev server proxies all `/api` requests to `http://localhost:5000` automatically.

## Build for production

```bash
npm run build
npm run preview
```

## Backend Requirements

Make sure the backend is started before the frontend:

```bash
# In the backend directory:
npm install
node server.js
```

## Tech Stack

- **React 18** – UI framework
- **React Router 6** – Client-side routing
- **Axios** – API requests
- **Recharts** – Charts and data visualization
- **Lucide React** – Icons
- **React Hot Toast** – Notifications
- **Vite** – Build tool and dev server

## Project Structure

```
src/
├── context/
│   └── AuthContext.jsx     # Auth state (login, register, logout)
├── services/
│   └── api.js              # All API calls mapped to backend routes
├── components/
│   ├── Layout.jsx          # Sidebar + main layout
│   └── Layout.css
├── pages/
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── Dashboard.jsx
│   ├── Accounts.jsx
│   ├── Transactions.jsx
│   ├── Transfers.jsx
│   ├── Cards.jsx
│   ├── Loans.jsx
│   ├── Bills.jsx
│   ├── Crypto.jsx
│   ├── Notifications.jsx
│   ├── Profile.jsx
│   ├── Support.jsx
│   ├── Auth.css
│   └── Page.css
├── App.jsx                 # Routes
├── main.jsx                # Entry point
└── index.css               # Global styles
```
