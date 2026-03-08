# Customer Kiosk Flow

## Overview

A self-service kiosk system that greets incoming parties, handles reservations, checks real-time table availability via YOLO tracking, and manages a waitlist via email.

---

## Routes

| Route | Description |
|---|---|
| `/welcome_page` | Greet party, ask about reservation |
| `/confirm_reservation` | Validate existing reservation → assign table |
| `/table_free` | No reservation, but a table is available → assign table |
| `/all_full_enter_email` | No tables available → collect email for waitlist |

---

## Flow

```
Camera detects party of N approaching
  └─ Kiosk: "Welcome! Party of N — do you have a reservation?"
       ├─ [Yes] → /confirm_reservation
       │            └─ Reservation found → "Proceed to Table X"
       │
       └─ [No]  → check YOLO-tracked table availability
                  ├─ Table free (capacity ≥ N) → /table_free
                  │    └─ "Table X is ready for you"
                  │
                  └─ All full → /all_full_enter_email
                               └─ Show estimated wait time
                               └─ Guest enters email → waitlist entry created
                                    └─ Table frees → Email sent to guest → Guest returns
```

---

## Screen Wireframes

### 1. `/welcome_page`
```
┌─────────────────────────────────┐
│  Welcome!                       │
│  Do you have a reservation?     │
│                                 │
│       [ Yes ]     [ No ]        │
└─────────────────────────────────┘
```

### 2. `/confirm_reservation`
```
┌─────────────────────────────────┐
│  Enter your phone number        │
│  ┌───────────────────────────┐  │
│  │ Phone: _______________    │  │
│  └───────────────────────────┘  │
│           [ Confirm ]           │
└─────────────────────────────────┘
```

### 3. `/table_free`
```
┌─────────────────────────────────┐
│  Table X is free!               │
│  Please proceed to your table.  │
└─────────────────────────────────┘
```

### 4. `/all_full_enter_email`
```
┌─────────────────────────────────┐
│  All full — estimated wait: Xm  │
│  Enter your email for waitlist: │
│  ┌───────────────────────────┐  │
│  │ Email: ________________   │  │
│  └───────────────────────────┘  │
│           [ Join Waitlist ]     │
└─────────────────────────────────┘
```

---

## Notes

- Table availability is tracked in real-time using **YOLO object detection**.
- Waitlist emails are triggered automatically when a tracked table becomes free.
- Phone number input on the reservation screen can be used to look up the booking in the reservation system.
