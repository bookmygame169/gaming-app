/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { ConsoleId } from "@/lib/constants";
import { BillingItem, PricingTier } from "../types";
import { getLocalDateString } from "../utils";
import { calcBillingPrice } from "../utils/pricing";

type ToastFns = { success: (msg: string) => void; error: (msg: string) => void };

type UseBillingProps = {
  enabled?: boolean;
  selectedCafeId: string;
  consolePricing: Record<string, Record<string, PricingTier>>;
  stationPricing: Record<string, any>;
  cafeData?: Record<string, any> | null;
  toast?: ToastFns;
};

export function useBilling({
  enabled = true,
  selectedCafeId,
  consolePricing,
  stationPricing,
  cafeData,
  toast,
}: UseBillingProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bookingDate, setBookingDate] = useState(getLocalDateString());
  const [startTime, setStartTime] = useState(() => {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  });
  const [items, setItems] = useState<BillingItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableConsoles, setAvailableConsoles] = useState<ConsoleId[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Array<{ name: string; phone: string }>>([]);
  const [activeSuggestionField, setActiveSuggestionField] = useState<'name' | 'phone' | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper function to get price — delegates to shared util
  const getBillingPrice = (consoleType: string, quantity: number, duration: number) =>
    calcBillingPrice(consoleType, quantity, duration, selectedCafeId, consolePricing, stationPricing);

  const addBillingItem = () => {
    const consoleType = availableConsoles[0] || "ps5";
    const quantity = 1;
    const duration = 60;
    const price = getBillingPrice(consoleType, quantity, duration);

    setItems([
      ...items,
      {
        id: Math.random().toString(36).substr(2, 9),
        console: consoleType,
        quantity: quantity,
        duration: duration,
        price: price,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };

          // Recalculate price if console, quantity, or duration changed
          if (field === 'console' || field === 'quantity' || field === 'duration') {
            updatedItem.price = getBillingPrice(
              updatedItem.console,
              updatedItem.quantity,
              updatedItem.duration
            );
          }

          return updatedItem;
        }
        return item;
      })
    );
  };

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setBookingDate(getLocalDateString());
    setStartTime(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    setItems([]);
    setPaymentMode("cash");
  };

  const handleSubmit = async () => {
    if (!selectedCafeId || !customerName || !startTime || items.length === 0) {
      toast?.error("Please fill in all required fields and add at least one console");
      return;
    }

    setIsSubmitting(true);

    const [hours, minutes] = startTime.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const hours12 = hours % 12 || 12;
    const startTime12h = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;

    try {
      const res = await fetch('/api/owner/billing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking: {
            cafe_id: selectedCafeId,
            customer_name: customerName,
            customer_phone: customerPhone || null,
            booking_date: bookingDate,
            start_time: startTime12h,
            duration: Math.max(...items.map(i => i.duration)),
            total_amount: totalAmount,
            status: 'in-progress',
            source: 'walk-in',
            payment_mode: paymentMode,
          },
          items: items.map((item) => ({
            console: item.console,
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create booking');
      }

      toast?.success("Walk-in booking created successfully!");
      resetForm();
    } catch (error) {
      console.error("Error creating booking:", error);
      toast?.error("Failed to create booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update total amount
  useEffect(() => {
    const calculatedTotal = items.reduce((sum, item) => sum + item.price, 0);
    setTotalAmount(calculatedTotal);
  }, [items]);

  // Load available consoles from cafeData prop (no direct Supabase call)
  useEffect(() => {
    const data = cafeData;
    if (!data) return;

    const available: ConsoleId[] = [];
    if (data.ps5_count > 0) available.push("ps5");
    if (data.ps4_count > 0) available.push("ps4");
    if (data.xbox_count > 0) available.push("xbox");
    if (data.pc_count > 0) available.push("pc");
    if (data.pool_count > 0) available.push("pool");
    if (data.snooker_count > 0) available.push("snooker");
    if (data.arcade_count > 0) available.push("arcade");
    if (data.vr_count > 0) available.push("vr");
    if (data.steering_wheel_count > 0) available.push("steering");
    if (data.racing_sim_count > 0) available.push("racing_sim");
    setAvailableConsoles(available);
  }, [cafeData]);

  // Debounced server-side customer search for autocomplete
  const searchCustomers = (query: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (query.length < 2) {
      setShowSuggestions(false);
      setFilteredSuggestions([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      if (!selectedCafeId) return;
      try {
        const res = await fetch(`/api/owner/coupons/customers?cafeId=${selectedCafeId}&search=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          setFilteredSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch {}
    }, 300);
  };

  const handleNameChange = (val: string) => {
    setCustomerName(val);
    setActiveSuggestionField('name');
    searchCustomers(val);
  };

  const handlePhoneChange = (val: string) => {
    setCustomerPhone(val);
    setActiveSuggestionField('phone');
    searchCustomers(val);
  };

  const handleSuggestionClick = (customer: { name: string; phone: string }) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || "");
    setShowSuggestions(false);
  };

  return {
    customerName, setCustomerName,
    customerPhone, setCustomerPhone,
    bookingDate, setBookingDate,
    startTime, setStartTime,
    items, setItems,
    paymentMode, setPaymentMode,
    totalAmount,
    isSubmitting,
    availableConsoles,
    showSuggestions, setShowSuggestions,
    filteredSuggestions,
    activeSuggestionField,
    addBillingItem,
    removeItem,
    updateItem,
    handleSubmit,
    handleNameChange,
    handlePhoneChange,
    handleSuggestionClick,
    getBillingPrice
  };
}
