// src/utils/attendanceHelper.ts

export const STANDARD_FULL_DAY_HOURS = 8.5; // 8:30 in decimal hours

// Parse 12-hour time string (e.g. "10:30 AM" or "06:15 PM") → decimal hours (0-24)
export const parseTimeString = (timeStr?: string): number | null => {
  if (!timeStr || timeStr.trim() === '') return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour + minute / 60;
};

// OT Slab Logic
export const calculateOTFromExtraMinutes = (extraMin: number): number => {
  if (extraMin < 30) return 0;
  if (extraMin >= 30 && extraMin < 45) return 30;
  if (extraMin >= 45 && extraMin < 60) return 60;
  
  const fullHours = Math.floor(extraMin / 60);
  const remainingMinutes = extraMin % 60;
  
  let otMinutes = fullHours * 60;
  
  if (remainingMinutes >= 45) {
    otMinutes += 45;
  } else if (remainingMinutes >= 30) {
    otMinutes += 30;
  } else if (remainingMinutes >= 15) {
    otMinutes += 15;
  }
  
  return otMinutes;
};

export interface AttendanceCalculationResult {
  workHrs: number;
  otHrs: number;
  pendingHrs: number;
  actualWorkHrs: number;
  autoStatus: 'Absent' | 'Half Day' | 'Present';
}

/**
 * Calculates work details including status, work hours, OT, and pending hours.
 * 
 * Worked Hours (net worked hours) thresholds for auto status:
 * - Work < 4:00 hrs -> Absent (counted as OT)
 * - Work >= 4:00 hrs and <= 6:30 hrs -> Half Day
 * - Work > 6:30 hrs and <= 8:30 hrs -> Present
 * - Work > 8:30 hrs -> Present (excess counted as OT)
 * 
 * Pending hours are only calculated for Present-status rows (Work > 6:30 and <= 8:30).
 * Formula: Pending = 8:30 - Work hours.
 * For Absent, Half Day, and Holiday rows, Pending is 0.
 */
export const calculateAttendanceDetails = (
  checkIn: string,
  lunchIn: string,
  lunchOut: string,
  checkOut: string,
  shiftType: 'day' | 'night' | 'sunday',
  currentStatus?: string
): AttendanceCalculationResult => {
  const ci = parseTimeString(checkIn);
  const li = parseTimeString(lunchIn);
  const lo = parseTimeString(lunchOut);
  const coRaw = parseTimeString(checkOut);

  // If check-in or check-out is missing, treat as no work
  if (ci == null || coRaw == null) {
    return {
      workHrs: 0,
      otHrs: 0,
      pendingHrs: (currentStatus === 'Present') ? STANDARD_FULL_DAY_HOURS : 0,
      actualWorkHrs: 0,
      autoStatus: 'Absent',
    };
  }

  let co = coRaw;
  if (shiftType === 'night' && coRaw <= ci) {
    co = coRaw + 24;
  }

  if (co <= ci) {
    return {
      workHrs: 0,
      otHrs: 0,
      pendingHrs: (currentStatus === 'Present') ? STANDARD_FULL_DAY_HOURS : 0,
      actualWorkHrs: 0,
      autoStatus: 'Absent',
    };
  }

  let total = co - ci;

  let extraLunch = 0;
  // Day & Night shifts have lunch breaks by default
  const hasLunch = shiftType !== 'sunday';
  if (hasLunch && li != null && lo != null) {
    let lunchInH = li;
    let lunchOutH = lo;

    if (shiftType === 'night' && lunchOutH <= lunchInH) {
      lunchOutH += 24;
    }

    if (lunchOutH > lunchInH) {
      const actualLunch = lunchOutH - lunchInH;
      extraLunch = Math.max(0, actualLunch - 0.5);
    }
  }

  let net = total - extraLunch;
  if (net < 0) net = 0;

  // Auto-status based on worked hours
  let autoStatus: 'Absent' | 'Half Day' | 'Present';
  if (net < 4.0) {
    autoStatus = 'Absent';
  } else if (net <= 6.5) {
    autoStatus = 'Half Day';
  } else {
    autoStatus = 'Present';
  }

  // Active status is either the manually specified one (if valid) or the auto status
  const activeStatus = (currentStatus && currentStatus !== 'Select') ? currentStatus : autoStatus;

  let workHrs = 0;
  let otHrs = 0;
  let pendingHrs = 0;

  if (activeStatus === 'Holiday' || activeStatus === 'Select') {
    workHrs = 0;
    otHrs = 0;
    pendingHrs = 0;
  } else if (activeStatus === 'Absent') {
    workHrs = 0;
    // Keep existing: "Working <= 4 hrs = Absent (counted as OT)"
    // If the active status is Absent and net worked hours < 4, worked hours count as OT.
    if (net < 4.0) {
      otHrs = net;
    } else {
      otHrs = 0;
    }
    pendingHrs = 0;
  } else if (activeStatus === 'Half Day') {
    workHrs = net;
    otHrs = 0;
    pendingHrs = 0;
  } else if (activeStatus === 'Present') {
    if (net > STANDARD_FULL_DAY_HOURS) {
      workHrs = STANDARD_FULL_DAY_HOURS;
      const extraMinutes = (net - STANDARD_FULL_DAY_HOURS) * 60;
      const otMinutes = calculateOTFromExtraMinutes(extraMinutes);
      otHrs = otMinutes / 60;
      pendingHrs = 0;
    } else {
      workHrs = net;
      otHrs = 0;
      // Pending hours only apply to Present status rows when Work hours are > 6:30 (6.5) and <= 8:30 (8.5)
      if (workHrs > 6.5 && workHrs <= STANDARD_FULL_DAY_HOURS) {
        pendingHrs = STANDARD_FULL_DAY_HOURS - workHrs;
      } else {
        pendingHrs = 0;
      }
    }
  }

  return {
    workHrs: Number(workHrs.toFixed(4)),
    otHrs: Number(otHrs.toFixed(4)),
    pendingHrs: Number(pendingHrs.toFixed(4)),
    actualWorkHrs: Number(net.toFixed(4)),
    autoStatus,
  };
};
