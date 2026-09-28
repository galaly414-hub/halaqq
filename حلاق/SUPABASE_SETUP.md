# Halaq Barber Shop - Supabase Integration Setup Guide

## Overview
This guide explains how to connect the existing "حلاق" project to Supabase.

## Supabase Project Details
- **Project URL**: https://mrhdqlrbzbnnvzysmztn.supabase.co
- **Publishable Key**: sb_publishable_7pNGQf1BfC91iirBNRQ9Ag_JF15ng8O

---

## Step 1: Run Database Migration

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy the **entire contents** of `supabase/database.sql`
5. Paste and click **Run**

This will create:
- All tables (admin_profiles, shop_settings, barbers, services, barber_services, customers, bookings, queue_entries, payments)
- Enums for statuses
- Row Level Security policies
- Secure RPC functions (create_booking, track_booking, update_queue_status, mark_payment_paid, get_dashboard_stats)
- Demo data (shop settings, 3 barbers, 11 services, barber-service relationships)

---

## Step 2: Create First Admin User

1. In Supabase Dashboard, go to **Authentication** → **Users**
2. Click **Add User** → **Create New User**
3. Enter:
   - **Email**: your admin email (e.g., admin@halaq.example)
   - **Password**: secure password
   - **Email Confirm**: ✓ (checked)
4. Click **Create User**
5. Copy the **User ID** (UUID)

### Link Admin Profile
1. Go to **Table Editor** → **admin_profiles**
2. Click **Insert Row**
3. Fill in:
   - **user_id**: paste the UUID from step 5
   - **name**: your name (e.g., "محمد العمري")
   - **role**: "manager" (or "receptionist")
4. Click **Save**

---

## Step 3: Configure Environment

The publishable key is already configured in `js/supabase.js`. No additional environment variables needed for the frontend.

---

## Step 4: Test the Integration

### Customer Side (index.html)
1. Open `index.html` in a browser
2. Click "احجز موعدك"
3. Select a service, barber, date/time
4. Enter customer details
5. Confirm booking
6. Verify booking number and waiting number are generated

### Admin Side (admin/index.html)
1. Open `admin/index.html`
2. Sign in with the admin email/password created in Step 2
3. Verify dashboard shows stats
4. Check bookings, queue, barbers, services tabs work

### Tracking Page (track.html)
1. Open `track.html`
2. Enter a booking number and mobile from a test booking
3. Verify tracking shows queue position, estimated wait time

---

## Step 5: Verify RLS Policies

In Supabase Dashboard → **Authentication** → **Policies**, verify these policies exist:

| Table | Policy |
|-------|--------|
| admin_profiles | Admins can manage admin profiles |
| shop_settings | Admins can manage shop settings |
| barbers | Admins can manage barbers / Public can read active |
| services | Admins can manage services / Public can read active |
| barber_services | Admins can manage / Public can read |
| customers | Admins can manage |
| bookings | Admins can manage |
| queue_entries | Admins can manage |
| payments | Admins can manage |

---

## Key Features Implemented

### Customer Booking Flow
- ✅ Service selection from Supabase
- ✅ Barber selection (specific or "any available")
- ✅ Date/time selection with real availability
- ✅ Customer details validation
- ✅ Booking creation via secure RPC
- ✅ Automatic booking number (HLQ-YYMMDD-NNN)
- ✅ Automatic waiting number (A001, A002...)
- ✅ Queue entry creation

### Admin Dashboard
- ✅ Supabase Auth authentication
- ✅ Role-based access (manager/receptionist)
- ✅ Real-time data from Supabase
- ✅ Queue management (update status)
- ✅ Payment tracking (mark as paid - onsite only)
- ✅ Dashboard statistics

### Security
- ✅ Row Level Security on all tables
- ✅ No service_role key in frontend
- ✅ Secure RPC functions for customer actions
- ✅ Admin-only direct table access
- ✅ No online payment logic (only onsite)

---

## File Structure

```
supabase/
  └── database.sql          # Complete database schema

js/
  ├── supabase.js           # Supabase client config
  ├── components/
  │   ├── booking-flow.js   # Updated to use Supabase RPC
  │   ├── booking-store.js  # Updated to use Supabase
  │   └── booking-schedule.js # Updated for dynamic availability
  └── admin/
      ├── auth.js           # Updated for Supabase Auth
      └── data.js           # New admin data module
```

---

## Troubleshooting

### "Failed to fetch" errors
- Verify the Supabase URL and key in `js/supabase.js`
- Check browser console for CORS errors
- Ensure Supabase project is active

### Booking creation fails
- Check Supabase logs for RPC errors
- Verify all required tables exist
- Check RLS policies allow the operation

### Admin login fails
- Verify user exists in auth.users
- Verify admin_profiles row exists with correct user_id
- Check role is "manager" or "receptionist"

### Real-time not working
- Verify Realtime is enabled in Supabase (Database → Replication)
- Check channel subscriptions in browser console

---

## No Online Payments
This implementation **only supports onsite payments**:
- Payment status starts as "غير مدفوع"
- Admin marks as "مدفوع" after customer pays in shop
- No Stripe, PayPal, or any payment gateway integration
- Payment flow: Booking → Unpaid → Service Complete → Customer Pays → Admin Marks Paid

---

## Support
For issues, check:
1. Browser console for JavaScript errors
2. Supabase Dashboard → Logs for API errors
3. Network tab for failed requests