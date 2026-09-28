-- =============================================================================
-- Halaq Barber Shop - Complete Database Schema for Supabase
-- =============================================================================
-- Run this entire script in Supabase Dashboard → SQL Editor
-- Project: https://mrhdqlrbzbnnvzysmztn.supabase.co
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE barber_status AS ENUM ('متاح', 'مشغول', 'غير متاح', 'خارج الدوام');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM (
        'مؤكد', 'في الانتظار', 'حضر', 'جاري الخدمة', 'مكتمل', 'ملغي', 'لم يحضر'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('غير مدفوع', 'مدفوع');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM (
        'في الانتظار', 'حضر', 'جاري الخدمة', 'مكتمل', 'تم التخطي', 'ملغي', 'لم يحضر'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Generate unique booking number: HLQ-YYMMDD-NNN
CREATE OR REPLACE FUNCTION generate_booking_number(p_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_day TEXT;
    v_seq INTEGER;
    v_booking_number TEXT;
BEGIN
    v_day := TO_CHAR(p_date, 'YYMMDD');
    LOOP
        SELECT COALESCE(MAX(CAST(SPLIT_PART(booking_number, '-', 3) AS INTEGER)), 0) + 1
        INTO v_seq
        FROM bookings
        WHERE booking_number LIKE 'HLQ-' || v_day || '-%';
        
        v_booking_number := 'HLQ-' || v_day || '-' || LPAD(v_seq::TEXT, 3, '0');
        
        IF NOT EXISTS (SELECT 1 FROM bookings WHERE booking_number = v_booking_number) THEN
            RETURN v_booking_number;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate waiting number: A001, A002, etc. per lane per day
CREATE OR REPLACE FUNCTION generate_waiting_number(p_lane CHAR, p_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_seq INTEGER;
    v_waiting_number TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(waiting_number FROM 2) AS INTEGER)), 0) + 1
    INTO v_seq
    FROM queue_entries
    WHERE lane = p_lane AND queue_date = p_date;
    
    v_waiting_number := p_lane || LPAD(v_seq::TEXT, 3, '0');
    RETURN v_waiting_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_result BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    SELECT EXISTS(
        SELECT 1 FROM admin_profiles WHERE user_id = v_user_id
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get lane for barber
CREATE OR REPLACE FUNCTION get_barber_lane(p_barber_id UUID)
RETURNS CHAR AS $$
DECLARE
    v_lane CHAR;
    v_display_order INTEGER;
BEGIN
    SELECT display_order INTO v_display_order
    FROM barbers
    WHERE id = p_barber_id;
    
    IF v_display_order = 1 THEN
        v_lane := 'A';
    ELSIF v_display_order = 2 THEN
        v_lane := 'B';
    ELSIF v_display_order = 3 THEN
        v_lane := 'C';
    ELSE
        v_lane := 'D';
    END IF;
    
    RETURN COALESCE(v_lane, 'D');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TABLES
-- =============================================================================

-- Admin Profiles (linked to auth.users)
CREATE TABLE admin_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('manager', 'receptionist')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_profiles_user_id ON admin_profiles(user_id);

-- Shop Settings
CREATE TABLE shop_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name TEXT NOT NULL DEFAULT 'حلاق',
    shop_tagline TEXT DEFAULT 'صالون الحلاق الراقي',
    logo_url TEXT,
    phone TEXT DEFAULT '055 123 4567',
    whatsapp TEXT DEFAULT '055 123 4567',
    email TEXT DEFAULT 'info@halaq.example',
    city TEXT DEFAULT 'الرياض',
    district TEXT DEFAULT 'حي العليا',
    address TEXT DEFAULT 'طريق الملك فهد، حي العليا، الرياض',
    map_url TEXT,
    opening_time TIME DEFAULT '10:00',
    closing_time TIME DEFAULT '22:00',
    friday_opening_time TIME DEFAULT '14:00',
    friday_closing_time TIME DEFAULT '22:00',
    saturday_closed BOOLEAN DEFAULT TRUE,
    timezone TEXT DEFAULT 'Asia/Riyadh',
    slot_minutes INTEGER DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 240),
    booking_window_days INTEGER DEFAULT 30 CHECK (booking_window_days BETWEEN 1 AND 365),
    lead_minutes INTEGER DEFAULT 60 CHECK (lead_minutes BETWEEN 0 AND 1440),
    cancellation_hours INTEGER DEFAULT 0 CHECK (cancellation_hours BETWEEN 0 AND 168),
    payment_note TEXT DEFAULT 'الدفع يتم داخل الصالون بعد تقديم الخدمة.',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_shop_settings_updated_at
    BEFORE UPDATE ON shop_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Barbers
CREATE TABLE barbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    title TEXT,
    profile_image_url TEXT,
    description TEXT,
    years_experience INTEGER DEFAULT 0,
    rating NUMERIC(2,1) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    reviews_count INTEGER DEFAULT 0,
    status barber_status DEFAULT 'متاح',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_barbers_status ON barbers(status);
CREATE INDEX idx_barbers_active ON barbers(is_active);
CREATE INDEX idx_barbers_display_order ON barbers(display_order);

CREATE TRIGGER update_barbers_updated_at
    BEFORE UPDATE ON barbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Barber Working Hours (JSONB for flexibility)
CREATE TABLE barber_working_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    is_closed BOOLEAN DEFAULT FALSE,
    start_time TIME,
    end_time TIME,
    break_start TIME,
    break_end TIME,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(barber_id, day_of_week)
);

CREATE INDEX idx_barber_working_hours_barber ON barber_working_hours(barber_id);

CREATE TRIGGER update_barber_working_hours_updated_at
    BEFORE UPDATE ON barber_working_hours
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar TEXT NOT NULL,
    description_ar TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    category TEXT NOT NULL,
    icon TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    badge_label TEXT,
    badge_tone TEXT CHECK (badge_tone IN ('brand', 'success', 'warning', 'info')),
    includes JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_active ON services(is_active);
CREATE INDEX idx_services_display_order ON services(display_order);

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Barber Services (many-to-many)
CREATE TABLE barber_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(barber_id, service_id)
);

CREATE INDEX idx_barber_services_barber ON barber_services(barber_id);
CREATE INDEX idx_barber_services_service ON barber_services(service_id);

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mobile)
);

CREATE INDEX idx_customers_mobile ON customers(mobile);
CREATE INDEX idx_customers_email ON customers(email);

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    service_id UUID REFERENCES services(id) ON DELETE RESTRICT,
    barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
    duration_snapshot INTEGER NOT NULL DEFAULT 0,
    booking_status booking_status DEFAULT 'مؤكد',
    payment_status payment_status DEFAULT 'غير مدفوع',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_barber ON bookings(barber_id);
CREATE INDEX idx_bookings_service ON bookings(service_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(booking_status);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_number ON bookings(booking_number);

CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Queue Entries
CREATE TABLE queue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
    lane CHAR(1) NOT NULL CHECK (lane IN ('A', 'B', 'C', 'D')),
    queue_date DATE NOT NULL,
    waiting_number TEXT UNIQUE NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    queue_status queue_status DEFAULT 'في الانتظار',
    called_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_entries_date ON queue_entries(queue_date);
CREATE INDEX idx_queue_entries_lane ON queue_entries(lane);
CREATE INDEX idx_queue_entries_status ON queue_entries(queue_status);
CREATE INDEX idx_queue_entries_waiting_number ON queue_entries(waiting_number);

CREATE TRIGGER update_queue_entries_updated_at
    BEFORE UPDATE ON queue_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payments (only onsite payments)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    method TEXT DEFAULT 'onsite' CHECK (method = 'onsite'),
    notes TEXT,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES admin_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Admin policies (full access for authenticated admins)
CREATE POLICY "Admins can manage admin profiles"
    ON admin_profiles FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage shop settings"
    ON shop_settings FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage barbers"
    ON barbers FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage barber working hours"
    ON barber_working_hours FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage services"
    ON services FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage barber services"
    ON barber_services FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage customers"
    ON customers FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage bookings"
    ON bookings FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage queue entries"
    ON queue_entries FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can manage payments"
    ON payments FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Public read access for customer-facing data
CREATE POLICY "Public can read active services"
    ON services FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Public can read active barbers"
    ON barbers FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Public can read shop settings"
    ON shop_settings FOR SELECT
    USING (TRUE);

CREATE POLICY "Public can read barber working hours"
    ON barber_working_hours FOR SELECT
    USING (TRUE);

CREATE POLICY "Public can read barber services"
    ON barber_services FOR SELECT
    USING (TRUE);

-- Customer booking creation via RPC (no direct insert)
-- Customers can only create bookings through the secure RPC function

-- Customer tracking via RPC (no direct select on bookings/queue)
-- Customers can only track via the secure RPC function

-- =============================================================================
-- SECURE RPC FUNCTIONS
-- =============================================================================

-- Create booking with all validations (customer-facing)
CREATE OR REPLACE FUNCTION create_booking(
    p_customer_name TEXT,
    p_customer_mobile TEXT,
    p_customer_email TEXT,
    p_service_id UUID,
    p_barber_id UUID, -- NULL means "any available"
    p_booking_date DATE,
    p_start_time TIME
)
RETURNS JSONB AS $$
DECLARE
    v_service RECORD;
    v_barber RECORD;
    v_customer RECORD;
    v_booking RECORD;
    v_queue RECORD;
    v_booking_number TEXT;
    v_waiting_number TEXT;
    v_lane CHAR;
    v_end_time TIME;
    v_conflict BOOLEAN;
    v_is_open BOOLEAN;
    v_working_hours RECORD;
    v_day_of_week INTEGER;
    v_open TIME;
    v_close TIME;
    v_closed BOOLEAN;
    v_booking_window INTEGER;
BEGIN
    -- Validate service exists and is active
    SELECT * INTO v_service FROM services WHERE id = p_service_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الخدمة غير موجودة أو غير نشطة');
    END IF;

    -- Validate date is within booking window
    SELECT window_days INTO v_booking_window FROM shop_settings LIMIT 1;
    IF p_booking_date < CURRENT_DATE OR p_booking_date > CURRENT_DATE + v_booking_window THEN
        RETURN jsonb_build_object('success', false, 'error', 'التاريخ خارج نطاق الحجز المسموح');
    END IF;

    -- Calculate end time
    v_end_time := p_start_time + (v_service.duration_minutes || ' minutes')::INTERVAL;

    -- Check if shop is open on this day
    SELECT EXTRACT(DOW FROM p_booking_date)::INTEGER INTO v_day_of_week;
    
    -- Check day-specific hours
    IF v_day_of_week = 5 THEN -- Friday
        SELECT friday_opening_time, friday_closing_time INTO v_open, v_close FROM shop_settings LIMIT 1;
    ELSIF v_day_of_week = 6 THEN -- Saturday
        SELECT saturday_closed INTO v_closed FROM shop_settings LIMIT 1;
        IF v_closed THEN
            RETURN jsonb_build_object('success', false, 'error', 'الصالون مغلق يوم السبت');
        END IF;
        SELECT opening_time, closing_time INTO v_open, v_close FROM shop_settings LIMIT 1;
    ELSE
        SELECT opening_time, closing_time INTO v_open, v_close FROM shop_settings LIMIT 1;
    END IF;

    -- Validate time is within shop hours
    IF p_start_time < v_open OR v_end_time > v_close THEN
        RETURN jsonb_build_object('success', false, 'error', 'الموعد خارج ساعات العمل');
    END IF;

    -- Handle barber selection
    IF p_barber_id IS NOT NULL THEN
        -- Specific barber requested - validate
        SELECT * INTO v_barber FROM barbers WHERE id = p_barber_id AND is_active = TRUE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'الحلاق غير موجود أو غير نشط');
        END IF;
        
        -- Check barber offers this service
        IF NOT EXISTS (SELECT 1 FROM barber_services WHERE barber_id = p_barber_id AND service_id = p_service_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'الحلاق لا يقدم هذه الخدمة');
        END IF;
        
        -- Check barber working hours for this day
        SELECT * INTO v_working_hours 
        FROM barber_working_hours 
        WHERE barber_id = p_barber_id AND day_of_week = v_day_of_week;
        
        IF v_working_hours.is_closed OR p_start_time < v_working_hours.start_time OR v_end_time > v_working_hours.end_time THEN
            RETURN jsonb_build_object('success', false, 'error', 'الحلاق غير متاح في هذا الوقت');
        END IF;
        
        -- Check for conflicting booking
        SELECT EXISTS(
            SELECT 1 FROM bookings 
            WHERE barber_id = p_barber_id 
            AND booking_date = p_booking_date
            AND booking_status NOT IN ('ملغي', 'لم يحضر')
            AND (
                (start_time <= p_start_time AND end_time > p_start_time) OR
                (start_time < v_end_time AND end_time >= v_end_time) OR
                (start_time >= p_start_time AND end_time <= v_end_time)
            )
        ) INTO v_conflict;
        
        IF v_conflict THEN
            RETURN jsonb_build_object('success', false, 'error', 'الحلاق لديه حجز متضارب في هذا الوقت');
        END IF;
        
        v_lane := get_barber_lane(p_barber_id);
    ELSE
        -- Find any available barber
        SELECT b.*, get_barber_lane(b.id) AS lane INTO v_barber
        FROM barbers b
        JOIN barber_services bs ON bs.barber_id = b.id
        WHERE b.is_active = TRUE 
        AND bs.service_id = p_service_id
        AND b.status = 'متاح'
        AND NOT EXISTS (
            SELECT 1 FROM barber_working_hours bwh
            WHERE bwh.barber_id = b.id 
            AND bwh.day_of_week = v_day_of_week
            AND (bwh.is_closed OR p_start_time < bwh.start_time OR v_end_time > bwh.end_time)
        )
        AND NOT EXISTS (
            SELECT 1 FROM bookings bk
            WHERE bk.barber_id = b.id 
            AND bk.booking_date = p_booking_date
            AND bk.booking_status NOT IN ('ملغي', 'لم يحضر')
            AND (
                (bk.start_time <= p_start_time AND bk.end_time > p_start_time) OR
                (bk.start_time < v_end_time AND bk.end_time >= v_end_time) OR
                (bk.start_time >= p_start_time AND bk.end_time <= v_end_time)
            )
        )
        ORDER BY b.display_order, b.created_at
        LIMIT 1;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'لا يوجد حلاق متاح لهذا الموعد');
        END IF;
        
        v_lane := v_barber.lane;
    END IF;

    -- Create or get customer
    INSERT INTO customers (full_name, mobile, email)
    VALUES (p_customer_name, p_customer_mobile, p_customer_email)
    ON CONFLICT (mobile) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, customers.email),
        updated_at = NOW()
    RETURNING * INTO v_customer;

    -- Generate booking number
    v_booking_number := generate_booking_number(p_booking_date);

    -- Create booking
    INSERT INTO bookings (
        booking_number,
        customer_id,
        service_id,
        barber_id,
        booking_date,
        start_time,
        end_time,
        price_snapshot,
        duration_snapshot,
        booking_status,
        payment_status
    ) VALUES (
        v_booking_number,
        v_customer.id,
        p_service_id,
        v_barber.id,
        p_booking_date,
        p_start_time,
        v_end_time,
        v_service.price,
        v_service.duration_minutes,
        'مؤكد',
        'غير مدفوع'
    ) RETURNING * INTO v_booking;

    -- Generate waiting number
    v_waiting_number := generate_waiting_number(v_lane, p_booking_date);

    -- Create queue entry
    INSERT INTO queue_entries (
        booking_id,
        lane,
        queue_date,
        waiting_number,
        position,
        queue_status
    ) VALUES (
        v_booking.id,
        v_lane,
        p_booking_date,
        v_waiting_number,
        (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM queue_entries
            WHERE lane = v_lane AND queue_date = p_booking_date
        ),
        'في الانتظار'
    ) RETURNING * INTO v_queue;

    RETURN jsonb_build_object(
        'success', true,
        'booking', jsonb_build_object(
            'id', v_booking.id,
            'booking_number', v_booking.booking_number,
            'waiting_number', v_queue.waiting_number,
            'customer_name', v_customer.full_name,
            'service_name', v_service.name_ar,
            'barber_name', v_barber.name,
            'booking_date', v_booking.booking_date,
            'start_time', v_booking.start_time,
            'end_time', v_booking.end_time,
            'price', v_booking.price_snapshot,
            'duration', v_booking.duration_snapshot,
            'booking_status', v_booking.booking_status,
            'payment_status', v_booking.payment_status
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Customer tracking RPC (customer-facing)
CREATE OR REPLACE FUNCTION track_booking(
    p_booking_number TEXT,
    p_mobile TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_booking RECORD;
    v_customer RECORD;
    v_service RECORD;
    v_barber RECORD;
    v_queue RECORD;
    v_now_serving RECORD;
    v_ahead_count INTEGER;
    v_estimate_minutes INTEGER;
    v_avg_duration INTEGER;
BEGIN
    -- Normalize inputs
    p_booking_number := UPPER(REGEXP_REPLACE(p_booking_number, '\s+', '', 'g'));
    p_mobile := REGEXP_REPLACE(p_mobile, '\D', '', 'g');
    
    -- Find booking with matching mobile
    SELECT b.*, c.full_name, c.mobile, c.email,
           s.name_ar AS service_name, s.duration_minutes,
           br.name AS barber_name
    INTO v_booking
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN barbers br ON br.id = b.barber_id
    WHERE UPPER(b.booking_number) = p_booking_number
    AND REGEXP_REPLACE(c.mobile, '\D', '', 'g') = p_mobile;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'رقم الحجز أو رقم الجوال غير صحيح');
    END IF;

    -- Get queue entry
    SELECT * INTO v_queue
    FROM queue_entries
    WHERE booking_id = v_booking.id;

    -- Calculate people ahead
    SELECT COUNT(*) INTO v_ahead_count
    FROM queue_entries qe
    JOIN bookings b ON b.id = qe.booking_id
    WHERE qe.lane = v_queue.lane
    AND qe.queue_date = v_queue.queue_date
    AND qe.queue_status IN ('في الانتظار', 'حضر', 'جاري الخدمة')
    AND (
        b.start_time < v_booking.start_time OR
        (b.start_time = v_booking.start_time AND qe.created_at < v_queue.created_at)
    );

    -- Get current serving
    SELECT qe.waiting_number, b.id
    INTO v_now_serving
    FROM queue_entries qe
    JOIN bookings b ON b.id = qe.booking_id
    WHERE qe.lane = v_queue.lane
    AND qe.queue_date = v_queue.queue_date
    AND qe.queue_status = 'جاري الخدمة'
    ORDER BY b.start_time, qe.created_at
    LIMIT 1;

    -- Estimate waiting time
    SELECT COALESCE(AVG(b.duration_snapshot), 30)::INTEGER INTO v_avg_duration
    FROM queue_entries qe
    JOIN bookings b ON b.id = qe.booking_id
    WHERE qe.lane = v_queue.lane
    AND qe.queue_date = v_queue.queue_date;

    IF v_ahead_count = 0 OR v_booking.booking_status IN ('مكتمل', 'ملغي', 'لم يحضر') THEN
        v_estimate_minutes := 0;
    ELSE
        v_estimate_minutes := GREATEST(5, ROUND((v_ahead_count * v_avg_duration) / 5.0) * 5);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_number', v_booking.booking_number,
        'waiting_number', v_queue.waiting_number,
        'customer_name', v_booking.full_name,
        'service_name', v_booking.service_name,
        'barber_name', v_booking.barber_name,
        'booking_date', v_booking.booking_date,
        'start_time', v_booking.start_time,
        'end_time', v_booking.end_time,
        'booking_status', v_booking.booking_status,
        'payment_status', v_booking.payment_status,
        'current_queue_number', v_now_serving.waiting_number,
        'people_ahead', v_ahead_count,
        'estimated_wait_minutes', v_estimate_minutes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: Update queue status
CREATE OR REPLACE FUNCTION update_queue_status(
    p_queue_id UUID,
    p_new_status queue_status
)
RETURNS JSONB AS $$
DECLARE
    v_queue RECORD;
    v_booking RECORD;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_queue FROM queue_entries WHERE id = p_queue_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'طابور غير موجود');
    END IF;

    UPDATE queue_entries 
    SET queue_status = p_new_status,
        updated_at = NOW(),
        called_at = CASE WHEN p_new_status = 'حضر' THEN NOW() ELSE called_at END,
        started_at = CASE WHEN p_new_status = 'جاري الخدمة' THEN NOW() ELSE started_at END,
        completed_at = CASE WHEN p_new_status = 'مكتمل' THEN NOW() ELSE completed_at END
    WHERE id = p_queue_id
    RETURNING * INTO v_queue;

    -- Also update booking status
    SELECT * INTO v_booking FROM bookings WHERE id = v_queue.booking_id;
    
    CASE p_new_status
        WHEN 'حضر' THEN
            UPDATE bookings SET booking_status = 'حضر', updated_at = NOW() WHERE id = v_booking.id;
        WHEN 'جاري الخدمة' THEN
            UPDATE bookings SET booking_status = 'جاري الخدمة', updated_at = NOW() WHERE id = v_booking.id;
        WHEN 'مكتمل' THEN
            UPDATE bookings SET booking_status = 'مكتمل', updated_at = NOW() WHERE id = v_booking.id;
        WHEN 'ملغي' THEN
            UPDATE bookings SET booking_status = 'ملغي', updated_at = NOW() WHERE id = v_booking.id;
        WHEN 'تم التخطي' THEN
            UPDATE bookings SET booking_status = 'ملغي', updated_at = NOW() WHERE id = v_booking.id;
        WHEN 'لم يحضر' THEN
            UPDATE bookings SET booking_status = 'لم يحضر', updated_at = NOW() WHERE id = v_booking.id;
    END CASE;

    RETURN jsonb_build_object('success', true, 'queue_status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: Mark payment as paid
CREATE OR REPLACE FUNCTION mark_payment_paid(
    p_booking_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_booking RECORD;
    v_payment RECORD;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'حجز غير موجود');
    END IF;

    IF v_booking.payment_status = 'مدفوع' THEN
        RETURN jsonb_build_object('success', false, 'error', 'الدفعة مدفوعة بالفعل');
    END IF;

    -- Create payment record
    INSERT INTO payments (booking_id, amount, method, created_by)
    SELECT p_booking_id, v_booking.price_snapshot, 'onsite', id
    FROM admin_profiles WHERE user_id = auth.uid()
    RETURNING * INTO v_payment;

    -- Update booking payment status
    UPDATE bookings SET payment_status = 'مدفوع', updated_at = NOW() WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'payment', to_jsonb(v_payment));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: Get dashboard stats
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    v_stats JSONB;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT jsonb_build_object(
        'total_bookings', (SELECT COUNT(*) FROM bookings),
        'today_bookings', (SELECT COUNT(*) FROM bookings WHERE booking_date = CURRENT_DATE),
        'waiting_count', (SELECT COUNT(*) FROM queue_entries WHERE queue_status IN ('في الانتظار', 'حضر', 'جاري الخدمة')),
        'unpaid_count', (SELECT COUNT(*) FROM bookings WHERE payment_status = 'غير مدفوع' AND booking_status = 'مكتمل'),
        'active_barbers', (SELECT COUNT(*) FROM barbers WHERE is_active = TRUE),
        'active_services', (SELECT COUNT(*) FROM services WHERE is_active = TRUE)
    ) INTO v_stats;

    RETURN jsonb_build_object('success', true, 'stats', v_stats);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- DEMO DATA
-- =============================================================================

-- Insert shop settings
INSERT INTO shop_settings (
    shop_name, shop_tagline, phone, whatsapp, email,
    city, district, address, map_url,
    opening_time, closing_time, friday_opening_time, friday_closing_time,
    saturday_closed, timezone, slot_minutes, booking_window_days,
    lead_minutes, cancellation_hours, payment_note
) VALUES (
    'حلاق', 'صالون الحلاق الراقي', '055 123 4567', '055 123 4567', 'info@halaq.example',
    'الرياض', 'حي العليا', 'طريق الملك فهد، حي العليا، الرياض',
    'https://maps.google.com/?q=Olaya+Riyadh',
    '10:00', '22:00', '14:00', '22:00',
    TRUE, 'Asia/Riyadh', 30, 30, 60, 0,
    'الدفع يتم داخل الصالون بعد تقديم الخدمة.'
) ON CONFLICT DO NOTHING;

-- Insert demo barbers
INSERT INTO barbers (name, title, profile_image_url, description, years_experience, rating, reviews_count, status, display_order) VALUES
('أحمد الغامدي', 'حلاق أول — متخصص في التدرّج', NULL, 'خبرة 12 سنة في قصّات الشعر والتدرّج والتصفيف.', 12, 4.9, 512, 'متاح', 1),
('خالد الشمري', 'حلاق أول — خبير اللحية', NULL, 'خبرة 9 سنوات في تهذيب اللحية والحلاقة بالشفرة.', 9, 4.8, 386, 'متاح', 2),
('عبدالله القحطاني', 'حلاق أول — صبغات وتصفيف', NULL, 'خبرة 7 سنوات في صبغات الشعر واللحية وتصفيتها.', 7, 4.7, 241, 'مشغول', 3)
ON CONFLICT DO NOTHING;

-- Insert barber working hours (all barbers same hours for demo)
INSERT INTO barber_working_hours (barber_id, day_of_week, is_closed, start_time, end_time, break_start, break_end)
SELECT b.id, d.day, d.closed, d.start, d.end_time, d.break_start, d.break_end
FROM barbers b
CROSS JOIN (VALUES
    (0, FALSE, '10:00'::TIME, '22:00'::TIME, '14:00'::TIME, '15:00'::TIME),
    (1, FALSE, '10:00'::TIME, '22:00'::TIME, '14:00'::TIME, '15:00'::TIME),
    (2, FALSE, '10:00'::TIME, '22:00'::TIME, '14:00'::TIME, '15:00'::TIME),
    (3, FALSE, '10:00'::TIME, '22:00'::TIME, '14:00'::TIME, '15:00'::TIME),
    (4, FALSE, '10:00'::TIME, '22:00'::TIME, '14:00'::TIME, '15:00'::TIME),
    (5, FALSE, '14:00'::TIME, '22:00'::TIME, NULL, NULL),
    (6, TRUE, NULL, NULL, NULL, NULL)
) AS d(day, closed, start, end_time, break_start, break_end)
ON CONFLICT DO NOTHING;

-- Insert demo services
--
-- Prices are what a mid-market Riyadh salon charges: a plain cut starts around
-- 50, a cut finished with a beard sits at 80, and the colouring work is the only
-- thing that reaches three figures. Durations are what the chair actually takes,
-- and the booking slots are built from them — so they are not rounded just to
-- look tidy.
-- =============================================================================
-- RETIRE THE PREVIOUS DEMO CATALOGUE
-- =============================================================================
--
-- This seed only adds rows, so an install that still holds the earlier demo
-- list would show both lists once the new one lands. The names below are the
-- old catalogue, written out one by one rather than removed as "anything not in
-- the new list", so a service the shop added by hand is never deleted by
-- running this script.
--
-- Order matters. The links go first, then the queue entries and payments that
-- hang off the old bookings, then the bookings, and only then the services
-- themselves - the foreign keys refuse the delete in any other order.

DELETE FROM barber_services
WHERE service_id IN (SELECT id FROM services WHERE name_ar IN (
   'قصّة كلاسيكية',
   'قصّة فيد متدرّجة',
   'قصّة أطفال',
   'تشكيل لحية كامل',
   'حلاقة ذقن',
   'حلاقة بالفوم الساخن',
   'جلسة فروة الرأس',
   'تدليك فروة الرأس',
   'تغطية الشيب',
   'صبغة شعر كاملة',
   'باقة VIP الكاملة'
));

DELETE FROM queue_entries
WHERE booking_id IN (
   SELECT b.id FROM bookings b
   WHERE b.service_id IN (SELECT id FROM services WHERE name_ar IN (
   'قصّة كلاسيكية',
   'قصّة فيد متدرّجة',
   'قصّة أطفال',
   'تشكيل لحية كامل',
   'حلاقة ذقن',
   'حلاقة بالفوم الساخن',
   'جلسة فروة الرأس',
   'تدليك فروة الرأس',
   'تغطية الشيب',
   'صبغة شعر كاملة',
   'باقة VIP الكاملة'
))
);

DELETE FROM payments
WHERE booking_id IN (
   SELECT b.id FROM bookings b
   WHERE b.service_id IN (SELECT id FROM services WHERE name_ar IN (
   'قصّة كلاسيكية',
   'قصّة فيد متدرّجة',
   'قصّة أطفال',
   'تشكيل لحية كامل',
   'حلاقة ذقن',
   'حلاقة بالفوم الساخن',
   'جلسة فروة الرأس',
   'تدليك فروة الرأس',
   'تغطية الشيب',
   'صبغة شعر كاملة',
   'باقة VIP الكاملة'
))
);

DELETE FROM bookings
WHERE service_id IN (SELECT id FROM services WHERE name_ar IN (
   'قصّة كلاسيكية',
   'قصّة فيد متدرّجة',
   'قصّة أطفال',
   'تشكيل لحية كامل',
   'حلاقة ذقن',
   'حلاقة بالفوم الساخن',
   'جلسة فروة الرأس',
   'تدليك فروة الرأس',
   'تغطية الشيب',
   'صبغة شعر كاملة',
   'باقة VIP الكاملة'
));

DELETE FROM services WHERE name_ar IN (
   'قصّة كلاسيكية',
   'قصّة فيد متدرّجة',
   'قصّة أطفال',
   'تشكيل لحية كامل',
   'حلاقة ذقن',
   'حلاقة بالفوم الساخن',
   'جلسة فروة الرأس',
   'تدليك فروة الرأس',
   'تغطية الشيب',
   'صبغة شعر كاملة',
   'باقة VIP الكاملة'
);

INSERT INTO services (name_ar, description_ar, price, duration_minutes, category, icon, is_active, display_order, badge_label, badge_tone, includes) VALUES
('حلاقة شعر', 'قصّة على مقاسك، مع تحديد الجوانب وتصفيف قبل ما تطلع.', 55, 40, 'cut', 'scissors', TRUE, 1, 'الأكثر طلباً', 'brand', '["معاينة القصّة واختيار الطول", "غسيل الشعر قبل البدء", "القصّة والتحديد بالماكينة", "تصفيف خفيف قبل الخروج"]'),
('حلاقة شعر ولحية', 'قصّة شعر كاملة مع تهذيب اللحية وضبط خط الرقبة.', 80, 55, 'cut', 'razor', TRUE, 2, 'الأكثر حجزاً', 'success', '["قصّة شعر كاملة", "تهذيب اللحية", "ضبط خط الرقبة", "تصفيف الشعر"]'),
('تحديد الجوانب', 'تدرّج ناعم في الجوانب مع حدود نظيفة قرب الأذن.', 30, 20, 'cut', 'layers', TRUE, 3, NULL, NULL, '["تدرّج حسب رغبتك", "حدود دقيقة قرب الأذن", "أدوات معقّمة لكل عميل"]'),
('حلاقة أطفال', 'قصّة شعر للأطفال، جلسة قصيرة ومقعد مخصّص.', 40, 30, 'cut', 'heart', TRUE, 4, NULL, NULL, '["مقعد مخصّص للأطفال", "جلسة قصيرة", "تصفيف بسيط"]'),
('تهذيب لحية', 'تقصير اللحية وتصحيح حوافها بالشفرة.', 40, 25, 'beard', 'palette', TRUE, 5, NULL, NULL, '["ضبط الطول والشكل", "تصحيح الحواف بالشفرة", "غسيل اللحية", "مرطب خفيف"]'),
('حلاقة بالموس', 'حلاقة بالشفرة مع فوم دافئ، نظافة أعلى لخط الذقن.', 65, 40, 'beard', 'razor', TRUE, 6, 'مميز', 'brand', '["شفرة جديدة لكل عميل", "فوم دافئ قبل الحلاقة", "خط الذقن والعنق", "مرطب بعد الحلاقة"]'),
('تنظيف وجه', 'تنظيف الوجه من الشعر الزائد مع ضبط عارفة الأذن والأنف.', 35, 20, 'beard', 'razor', TRUE, 7, NULL, NULL, '["تنظيف ما بالأنف والعارفة", "ضبط خط الأذن", "مسح وتهدئة البشرة"]'),
('صبغة لحية', 'صبغة اللحية بلون طبيعي مع تهذيب الحواف.', 80, 45, 'color', 'droplet', TRUE, 8, NULL, NULL, '["اختيار درجة اللون", "صبغة خفيفة", "تهذيب الحواف", "تجفيف"]'),
('صبغة شعر', 'صبغة كاملة بلون تختاره بعد معاينته على خصلة.', 130, 70, 'color', 'palette', TRUE, 9, 'بحجز مسبق', 'warning', '["معاينة اللون على خصلة", "معالجة إن لزم", "صبغة كاملة", "غسيل وتصفيف"]'),
('تغطية الشيب', 'تغطية الشيب بلون قريب من لون شعرك الأصلي.', 110, 45, 'color', 'layers', TRUE, 10, NULL, NULL, '["معاينة اللون على خصلة", "تغطية متدرجة", "تجفيف", "تصفيف خفيف"]'),
('غسيل شعر', 'غسيل الشعر بشامبو مناسب له وتجفيف خفيف.', 20, 10, 'care', 'droplet', TRUE, 11, NULL, NULL, '["شامبو مناسب لنوع شعرك", "ماء دافئ", "تجفيف خفيف"]'),
('سشوار وتصفيف', 'تصفيف الشعر بالسشوار بالاتجاه اللي تختاره.', 30, 20, 'care', 'sparkles', TRUE, 12, NULL, NULL, '["تصفيف بالاتجاه المطلوب", "منتجات ثابتة خفيفة", "لمسة نهائية"]'),
('حلاقة ولحية', 'قصّة شعر مع تهذيب اللحية في نفس الجلسة.', 85, 60, 'packages', 'scissors', TRUE, 13, 'توفير 10 ر.س', 'success', '["قصّة شعر كاملة", "تهذيب اللحية", "ضبط خط الرقبة", "تصفيف"]'),
('حلاقة ملكية', 'جلسة كاملة: قصّة، تهذيب لحية بالشفرة، وفوم وتصفيف.', 150, 90, 'packages', 'crown', TRUE, 14, 'الأكمل', 'brand', '["معاينة كاملة قبل البدء", "قصّة شعر مع تدرّج", "حلاقة بالشفرة للذقن", "فوم دافئ وتصفيف"]'),
('باقة الأب والابن', 'قصّتان في نفس الموعد، الأب والابن.', 90, 70, 'packages', 'gift', TRUE, 15, 'توفير 20 ر.س', 'success', '["قصّة كاملة للأب", "قصّة كاملة للابن", "الاثنين في نفس الموعد"]')
ON CONFLICT (name_ar) DO UPDATE SET
   description_ar   = EXCLUDED.description_ar,
   price            = EXCLUDED.price,
   duration_minutes = EXCLUDED.duration_minutes,
   category         = EXCLUDED.category,
   icon             = EXCLUDED.icon,
   is_active        = EXCLUDED.is_active,
   display_order    = EXCLUDED.display_order,
   badge_label      = EXCLUDED.badge_label,
   badge_tone       = EXCLUDED.badge_tone,
   includes         = EXCLUDED.includes;

-- Insert barber services relationships
INSERT INTO barber_services (barber_id, service_id)
SELECT b.id, s.id FROM barbers b, services s
WHERE (b.name = 'أحمد الغامدي' AND s.name_ar IN ('حلاقة شعر', 'حلاقة شعر ولحية', 'تحديد الجوانب', 'حلاقة أطفال', 'تنظيف وجه', 'سشوار وتصفيف', 'باقة الأب والابن'))
   OR (b.name = 'خالد الشمري' AND s.name_ar IN ('تهذيب لحية', 'حلاقة بالموس', 'حلاقة شعر ولحية', 'صبغة لحية', 'حلاقة ولحية', 'باقة الأب والابن'))
WHERE (b.name = 'عبدالله القحطاني' AND s.name_ar IN ('حلاقة شعر', 'حلاقة شعر ولحية', 'غسيل شعر', 'سشوار وتصفيف', 'صبغة شعر', 'صبغة لحية', 'تغطية الشيب', 'حلاقة ملكية'))
ON CONFLICT DO NOTHING;

-- =============================================================================
-- DEMO BOOKINGS
-- =============================================================================
--
-- A week of trading for one three-chair shop, so the dashboard, the queue, the
-- reports and the payments screen all open on a real day instead of an empty
-- one. Three things are computed rather than typed, on purpose:
--
--   * the dates are relative to the day this script is run, so "today" on the
--     dashboard is always a day that has a queue in it;
--   * the price and the duration are read out of `services` by name, so a demo
--     booking can never quote a price the catalogue no longer sells;
--   * Saturdays are skipped, because the salon is shut and a booking on a day
--     the shop never opens is the kind of detail that gives a demo away.
--
-- The whole block only applies to an empty `bookings` table, which is the same
-- rule the app uses when it seeds itself. Run it once, on a fresh install.

-- -----------------------------------------------------------------------------
-- Customers
--
-- No passwords and no logins: a customer only ever appears through a booking
-- they made with a mobile number, and that is how the salon actually recognises
-- a regular.
-- -----------------------------------------------------------------------------
INSERT INTO customers (full_name, mobile, email) VALUES
('ماجد الحربي',       '0553182740', 'm.alharbi@gmail.com'),
('تركي المطيري',      '0508842163', NULL),
('نايف السبيعي',      '0537719048', 'n.alotaibi@gmail.com'),
('بدر العتيبي',       '0554609327', NULL),
('سعود البقمي',       '0563927415', 's.albogami@gmail.com'),
('عمر الحازمي',       '0501276634', NULL),
('إبراهيم النجار',    '0559382046', NULL),
('مشعل الزهراني',     '0533648517', NULL),
('أنس الفيفي',        '0567014382', 'a.faifi@gmail.com'),
('راكان العمري',      '0592235671', NULL),
('لؤي المالكي',       '0508937462', NULL),
('مشاري العنزي',      '0554172395', NULL),
('عادل الشهري',       '0533187640', NULL),
('بندر السهلي',       '0562438901', NULL),
('فيصل الدوسري',      '0559126384', NULL),
('ناصر الحارثي',      '0506743928', 'n.harbi@gmail.com'),
('باسم القحطاني',     '0538461207', NULL),
('زياد الرشيد',       '0561293574', NULL),
('مازن السبيعي',      '0557329846', NULL),
('عاصم العمري',       '0518630294', NULL),
('تميم العسيري',      '0532947160', NULL),
('مهند العتيبي',      '0553094827', NULL),
('وليد البقمي',       '0504558123', NULL),
('رائد المالكي',      '0569073612', NULL),
('حازم النجار',       '0537285049', NULL),
('سعد المالكي',       '0558412093', NULL),
('طلال الزهراني',     '0534917826', NULL),
('نايف الزهراني',     '0508127364', NULL)
ON CONFLICT (mobile) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Bookings
--
-- `day_offset` counts back from today: 0 is today, 1 is yesterday, and a
-- negative offset is a day still to come. `barber_name` is NULL for the
-- "any available barber" choice, which is how those bookings are stored.
-- -----------------------------------------------------------------------------
WITH demo_rows (
    full_name, mobile, service_name, barber_name,
    day_offset, start_time, booking_status, payment_status, notes
) AS (VALUES
-- ============================ اليوم الحالي ================================
('ماجد الحربي',    '0553182740', 'حلاقة شعر',           'أحمد الغامدي',      0, '10:00', 'مكتمل',       'مدفوع',     NULL),
('تركي المطيري',   '0508842163', 'حلاقة شعر ولحية',     'أحمد الغامدي',      0, '10:45', 'مكتمل',       'مدفوع',     'يفضّل التدرّج الخفيف من الأعلى'),
('نايف السبيعي',   '0537719048', 'تحديد الجوانب',       'أحمد الغامدي',      0, '11:40', 'مكتمل',       'مدفوع',     NULL),
('بدر العتيبي',    '0554609327', 'حلاقة أطفال',         'أحمد الغامدي',      0, '12:30', 'مكتمل',       'مدفوع',     'معه طفل عمره 7 سنوات'),
('زياد الرشيد',    '0561293574', 'تحديد الجوانب',       'أحمد الغامدي',      0, '14:00', 'ملغي',        'غير مدفوع', 'اعتذار عن الحضور'),
('سعود البقمي',    '0563927415', 'حلاقة شعر ولحية',     'أحمد الغامدي',      0, '16:00', 'جاري الخدمة', 'غير مدفوع', NULL),
('عمر الحازمي',    '0501276634', 'حلاقة شعر',           'أحمد الغامدي',      0, '17:00', 'في الانتظار', 'غير مدفوع', NULL),
('مهند العتيبي',   '0553094827', 'حلاقة أطفال',         'أحمد الغامدي',      0, '18:30', 'مؤكد',        'غير مدفوع', NULL),
('وليد البقمي',    '0504558123', 'حلاقة شعر ولحية',     'أحمد الغامدي',      0, '19:00', 'مؤكد',        'غير مدفوع', NULL),

('إبراهيم النجار', '0559382046', 'تهذيب لحية',          'خالد الشمري',       0, '10:30', 'مكتمل',       'مدفوع',     NULL),
('مشعل الزهراني',  '0533648517', 'حلاقة بالموس',        'خالد الشمري',       0, '11:30', 'مكتمل',       'مدفوع',     NULL),
('أنس الفيفي',     '0567014382', 'صبغة لحية',           'خالد الشمري',       0, '12:40', 'مكتمل',       'مدفوع',     'لون بنّي طبيعي'),
('حازم النجار',    '0537285049', 'حلاقة بالموس',        'خالد الشمري',       0, '13:30', 'مكتمل',       'غير مدفوع', 'سدد المبلغ عند الكاشير'),
('تميم العسيري',   '0532947160', 'تهذيب لحية',          'خالد الشمري',       0, '15:00', 'لم يحضر',     'غير مدفوع', NULL),
('راكان العمري',   '0592235671', 'حلاقة بالموس',        'خالد الشمري',       0, '16:30', 'حضر',         'غير مدفوع', NULL),
('لؤي المالكي',    '0508937462', 'تهذيب لحية',          'خالد الشمري',       0, '17:30', 'في الانتظار', 'غير مدفوع', NULL),
('عاصم العمري',    '0518630294', 'حلاقة شعر ولحية',     'خالد الشمري',       0, '19:00', 'مؤكد',        'غير مدفوع', NULL),

('بندر السهلي',    '0562438901', 'صبغة شعر',            'عبدالله القحطاني',  0, '11:00', 'مكتمل',       'مدفوع',     'الحساسية من الصبغة قوية'),
('باسم القحطاني',  '0538461207', 'صبغة لحية',           'عبدالله القحطاني',  0, '12:30', 'مكتمل',       'مدفوع',     NULL),
('فيصل الدوسري',   '0559126384', 'تغطية الشيب', 'عبدالله القحطاني',  0, '13:30', 'مكتمل',       'مدفوع',     NULL),
('مشاري العنزي',   '0554172395', 'صبغة لحية',           'عبدالله القحطاني',  0, '15:30', 'جاري الخدمة', 'غير مدفوع', NULL),
('مازن السبيعي',   '0557329846', 'غسيل شعر',            'عبدالله القحطاني',  0, '17:00', 'في الانتظار', 'غير مدفوع', NULL),
('عادل الشهري',    '0533187640', 'تغطية الشيب', 'عبدالله القحطاني',  0, '18:00', 'مؤكد',        'غير مدفوع', NULL),

('نايف الزهراني',  '0508127364', 'تحديد الجوانب',       NULL,                0, '16:00', 'مؤكد',        'غير مدفوع', NULL),
('ناصر الحارثي',   '0506743928', 'سشوار وتصفيف',        NULL,                0, '14:00', 'لم يحضر',     'غير مدفوع', NULL),
('طلال الزهراني',  '0534917826', 'حلاقة شعر',           NULL,                0, '20:00', 'مؤكد',        'غير مدفوع', NULL),

-- ============================== قبل يومين ================================
('تركي المطيري',   '0508842163', 'حلاقة شعر',           'أحمد الغامدي',      1, '11:00', 'مكتمل',       'مدفوع',     NULL),
('نايف السبيعي',   '0537719048', 'تحديد الجوانب',       'أحمد الغامدي',      1, '12:00', 'مكتمل',       'مدفوع',     NULL),
('بدر العتيبي',    '0554609327', 'حلاقة أطفال',         'أحمد الغامدي',      1, '12:30', 'مكتمل',       'مدفوع',     'معه طفلة عمرها 5 سنوات'),
('مشعل الزهراني',  '0533648517', 'حلاقة بالموس',        'خالد الشمري',       1, '11:30', 'مكتمل',       'مدفوع',     NULL),
('حازم النجار',    '0537285049', 'تهذيب لحية',          'خالد الشمري',       1, '12:30', 'مكتمل',       'مدفوع',     NULL),
('بندر السهلي',    '0562438901', 'صبغة شعر',            'عبدالله القحطاني',  1, '15:00', 'مكتمل',       'مدفوع',     NULL),
('عاصم العمري',    '0518630294', 'صبغة لحية',           'عبدالله القحطاني',  1, '17:00', 'مكتمل',       'مدفوع',     NULL),
('راكان العمري',   '0592235671', 'حلاقة شعر',           NULL,                1, '19:00', 'ملغي',        'غير مدفوع', NULL),
('مازن السبيعي',   '0557329846', 'سشوار وتصفيف',        'عبدالله القحطاني',  1, '20:00', 'مكتمل',       'مدفوع',     NULL),
('وليد البقمي',    '0504558123', 'حلاقة شعر ولحية',     'أحمد الغامدي',      1, '19:00', 'مكتمل',       'مدفوع',     NULL),

-- ============================== قبل ثلاثة أيام ==============================
('عمر الحازمي',    '0501276634', 'حلاقة شعر',           'أحمد الغامدي',      2, '10:00', 'مكتمل',       'مدفوع',     NULL),
('سعود البقمي',    '0563927415', 'تحديد الجوانب',       'أحمد الغامدي',      2, '11:00', 'مكتمل',       'مدفوع',     NULL),
('مهند العتيبي',   '0553094827', 'حلاقة أطفال',         'أحمد الغامدي',      2, '11:30', 'مكتمل',       'مدفوع',     NULL),
('رائد المالكي',   '0569073612', 'حلاقة بالموس',        'خالد الشمري',       2, '10:30', 'مكتمل',       'مدفوع',     NULL),
('مشاري العنزي',   '0554172395', 'صبغة لحية',           'خالد الشمري',       2, '12:00', 'مكتمل',       'مدفوع',     NULL),
('زياد الرشيد',    '0561293574', 'تغطية الشيب', 'عبدالله القحطاني',  2, '14:00', 'مكتمل',       'مدفوع',     NULL),
('عادل الشهري',    '0533187640', 'حلاقة شعر',           NULL,                2, '18:00', 'لم يحضر',     'غير مدفوع', NULL),
('تميم العسيري',   '0532947160', 'تهذيب لحية',          'خالد الشمري',       2, '20:00', 'مكتمل',       'مدفوع',     NULL),

-- ============================== قبل أربعة أيام ==============================
('ماجد الحربي',    '0553182740', 'حلاقة شعر ولحية',     'أحمد الغامدي',      3, '18:00', 'مكتمل',       'مدفوع',     NULL),
('ناصر الحارثي',   '0506743928', 'حلاقة شعر',           'أحمد الغامدي',      3, '19:00', 'مكتمل',       'مدفوع',     NULL),
('أنس الفيفي',     '0567014382', 'حلاقة بالموس',        'خالد الشمري',       3, '17:00', 'مكتمل',       'مدفوع',     NULL),
('حازم النجار',    '0537285049', 'تهذيب لحية',          'خالد الشمري',       3, '18:00', 'مكتمل',       'مدفوع',     NULL),
('بندر السهلي',    '0562438901', 'صبغة لحية',           'عبدالله القحطاني',  3, '16:00', 'مكتمل',       'مدفوع',     NULL),
('باسم القحطاني',  '0538461207', 'غسيل شعر',            'عبدالله القحطاني',  3, '21:00', 'مكتمل',       'مدفوع',     NULL),
('طلال الزهراني',  '0534917826', 'حلاقة شعر',           NULL,                3, '20:00', 'ملغي',        'غير مدفوع', NULL),

-- ============================== قبل خمسة أيام ==============================
('تركي المطيري',   '0508842163', 'تحديد الجوانب',       'أحمد الغامدي',      4, '12:00', 'مكتمل',       'مدفوع',     NULL),
('بدر العتيبي',    '0554609327', 'حلاقة أطفال',         'أحمد الغامدي',      4, '12:30', 'مكتمل',       'مدفوع',     NULL),
('إبراهيم النجار', '0559382046', 'حلاقة شعر ولحية',     'خالد الشمري',       4, '17:30', 'مكتمل',       'مدفوع',     NULL),
('مازن السبيعي',   '0557329846', 'تغطية الشيب', 'عبدالله القحطاني',  4, '15:00', 'مكتمل',       'مدفوع',     NULL),
('وليد البقمي',    '0504558123', 'صبغة شعر',            'عبدالله القحطاني',  4, '16:30', 'مكتمل',       'مدفوع',     NULL),
('عاصم العمري',    '0518630294', 'حلاقة شعر',           NULL,                4, '19:00', 'مكتمل',       'مدفوع',     NULL),

-- ============================== قبل ستة أيام ==============================
('سعود البقمي',    '0563927415', 'حلاقة شعر ولحية',     'أحمد الغامدي',      5, '11:00', 'مكتمل',       'مدفوع',     NULL),
('مشعل الزهراني',  '0533648517', 'تهذيب لحية',          'خالد الشمري',       5, '12:00', 'مكتمل',       'مدفوع',     NULL),
('فيصل الدوسري',   '0559126384', 'صبغة لحية',           'عبدالله القحطاني',  5, '14:00', 'مكتمل',       'مدفوع',     NULL),
('عمر الحازمي',    '0501276634', 'حلاقة شعر',           'أحمد الغامدي',      5, '18:00', 'مكتمل',       'مدفوع',     NULL),
('مهند العتيبي',   '0553094827', 'سشوار وتصفيف',        NULL,                5, '20:00', 'مكتمل',       'مدفوع',     NULL),

-- =============================== الأيام القادمة =============================
('ماجد الحربي',    '0553182740', 'حلاقة شعر',           'أحمد الغامدي',     -1, '10:00', 'مؤكد',        'غير مدفوع', NULL),
('أنس الفيفي',     '0567014382', 'حلاقة بالموس',        'خالد الشمري',      -1, '17:00', 'مؤكد',        'غير مدفوع', NULL),
('بندر السهلي',    '0562438901', 'تغطية الشيب', 'عبدالله القحطاني', -1, '18:00', 'مؤكد',        'غير مدفوع', NULL),
('تركي المطيري',   '0508842163', 'باقة الأب والابن',    'أحمد الغامدي',     -2, '11:00', 'مؤكد',        'غير مدفوع', 'معه ابنه عمره 9 سنوات'),
('راكان العمري',   '0592235671', 'تهذيب لحية',          'خالد الشمري',      -2, '18:00', 'مؤكد',        'غير مدفوع', NULL),
('سعود البقمي',    '0563927415', 'صبغة شعر',            'عبدالله القحطاني', -3, '16:00', 'مؤكد',        'غير مدفوع', NULL),
('نايف السبيعي',   '0537719048', 'حلاقة أطفال',         'أحمد الغامدي',     -3, '12:00', 'مؤكد',        'غير مدفوع', NULL),
),
demo_dates AS (
    SELECT
        r.*,
        (CURRENT_DATE - r.day_offset) AS booking_date
    FROM demo_rows r
    WHERE EXTRACT(DOW FROM (CURRENT_DATE - r.day_offset))::INT <> 6
)
INSERT INTO bookings (
    booking_number, customer_id, service_id, barber_id,
    booking_date, start_time, end_time,
    price_snapshot, duration_snapshot,
    booking_status, payment_status, notes, created_at
)
SELECT
    'HLQ-' || TO_CHAR(d.booking_date, 'YYMMDD') || '-' ||
        LPAD(ROW_NUMBER() OVER (PARTITION BY d.booking_date ORDER BY d.start_time)::TEXT, 3, '0'),
    c.id,
    s.id,
    b.id,
    d.booking_date,
    d.start_time::TIME,
    (d.start_time::TIME + (s.duration_minutes || ' minutes')::INTERVAL)::TIME,
    s.price,
    s.duration_minutes,
    d.booking_status::booking_status,
    d.payment_status::payment_status,
    d.notes,
    (d.booking_date - 3) + d.start_time
FROM demo_dates d
JOIN customers c ON c.mobile = d.mobile
JOIN services  s ON s.name_ar = d.service_name
LEFT JOIN barbers b ON b.name = d.barber_name
WHERE NOT EXISTS (SELECT 1 FROM bookings);

-- -----------------------------------------------------------------------------
-- Queue entries
--
-- The number a customer reads is the lane letter plus their place in that
-- barber's day, so A001 is the first customer of the day in lane A. A booking
-- that is only "confirmed" has not been called yet, which is why it carries
-- 'في الانتظار' here and not its own booking status.
-- -----------------------------------------------------------------------------
INSERT INTO queue_entries (
    booking_id, lane, queue_date, waiting_number, position, queue_status,
    called_at, started_at, completed_at
)
SELECT
    bk.id,
    COALESCE(get_barber_lane(bk.barber_id), 'D') AS lane,
    bk.booking_date,
    COALESCE(get_barber_lane(bk.barber_id), 'D') || LPAD(
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(get_barber_lane(bk.barber_id), 'D'), bk.booking_date
            ORDER BY bk.start_time, bk.booking_number
        )::TEXT, 3, '0'
    ) AS waiting_number,
    ROW_NUMBER() OVER (
        PARTITION BY COALESCE(get_barber_lane(bk.barber_id), 'D'), bk.booking_date
        ORDER BY bk.start_time, bk.booking_number
    ) AS position,
    CASE bk.booking_status
        WHEN 'مؤكد' THEN 'في الانتظار'::queue_status
        ELSE bk.booking_status::queue_status
    END AS queue_status,
    CASE WHEN bk.booking_status IN ('حضر', 'جاري الخدمة', 'مكتمل')
         THEN bk.booking_date + bk.start_time - INTERVAL '5 minutes' END AS called_at,
    CASE WHEN bk.booking_status IN ('جاري الخدمة', 'مكتمل')
         THEN bk.booking_date + bk.start_time END AS started_at,
    CASE WHEN bk.booking_status = 'مكتمل'
         THEN bk.booking_date + bk.end_time END AS completed_at
FROM bookings bk
WHERE NOT EXISTS (SELECT 1 FROM queue_entries);

-- -----------------------------------------------------------------------------
-- Payments
--
-- The salon takes cash at the chair, and the till is settled at the end of the
-- day, so a handful of finished services are still sitting 'غير مدفوع'. Those
-- are the ones the payments screen has to be able to show as still owed.
-- -----------------------------------------------------------------------------
INSERT INTO payments (booking_id, amount, method, notes, paid_at)
SELECT
    bk.id,
    bk.price_snapshot,
    'onsite',
    'نقداً عند الكاشير',
    bk.booking_date + bk.end_time
FROM bookings bk
WHERE bk.payment_status = 'مدفوع'
  AND NOT EXISTS (SELECT 1 FROM payments);
