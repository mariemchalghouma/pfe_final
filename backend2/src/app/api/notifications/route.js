import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/controllers/notificationController";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  return getNotifications(user.id);
}

export async function PUT(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { action, notificationId } = await request.json();

  if (action === "markAllAsRead") {
    return markAllNotificationsAsRead(user.id);
  }

  if (action === "markAsRead" && notificationId) {
    return markNotificationAsRead(notificationId, user.id);
  }

  return Response.json(
    { success: false, message: "Action non reconnue" },
    { status: 400 },
  );
}
