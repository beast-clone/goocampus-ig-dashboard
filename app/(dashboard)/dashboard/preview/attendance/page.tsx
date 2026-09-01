import { getSessionIsAdmin } from "@/lib/auth";
import { AttendanceClient } from "./AttendanceClient";

// Team Attendance — admin-only. Login/logout + today's activity per teammate.
export default function AttendancePage() {
  return <AttendanceClient isAdmin={getSessionIsAdmin()} />;
}
