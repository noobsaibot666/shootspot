package expo.modules.publishactivity

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android counterpart of the iOS Live Activity (D-40): publish progress as a notification with
 * the photo, its name and a three-step bar (sending → processing → live). JS calls `sync` on every
 * step (src/lib/publish-activity.ts), with the same arguments as iOS. Tapping opens the location.
 */
class PublishActivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PublishActivity")

    AsyncFunction("sync") {
      draftId: String, title: String, phase: String, recordId: String?, photoUri: String? ->
      val context = appContext.reactContext ?: return@AsyncFunction
      if (phase == "sending") askOnce(context)
      PublishNotifications.sync(context, draftId, title, phase, recordId, photoUri)
    }
  }

  /** Android 13+: ask for notifications the first time a photo is published, in context. */
  private fun askOnce(context: Context) {
    if (Build.VERSION.SDK_INT < 33) return
    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED) return
    val prefs = context.getSharedPreferences("publish-activity", Context.MODE_PRIVATE)
    if (prefs.getBoolean("asked", false)) return
    val activity = appContext.currentActivity ?: return
    prefs.edit().putBoolean("asked", true).apply()
    activity.runOnUiThread {
      activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4711)
    }
  }
}

object PublishNotifications {
  private const val CHANNEL = "publish"
  private const val LINGER_LIVE_MS = 5 * 60 * 1000L
  private const val LINGER_OTHER_MS = 15 * 60 * 1000L

  // Same wording as the iOS Live Activity (targets/widget/PublishActivity.swift).
  private fun title(phase: String) = when (phase) {
    "sending" -> "Sending photo…"
    "processing" -> "Processing…"
    "live" -> "Live on ShootSpot"
    "rejected" -> "Photo not accepted"
    else -> "Saved on your phone"
  }

  private fun detail(phase: String) = when (phase) {
    "sending" -> "Keep scouting, it finishes on its own."
    "processing" -> "Almost there."
    "live" -> "Tap to open the location."
    "rejected" -> "Open ShootSpot for the reason."
    else -> "It's sent when you're back online."
  }

  private fun step(phase: String) = when (phase) {
    "sending" -> 1
    "processing" -> 2
    "live" -> 3
    else -> 0
  }

  private val photos = mutableMapOf<String, Bitmap?>()

  fun sync(
    context: Context,
    draftId: String,
    name: String,
    phase: String,
    recordId: String?,
    photoUri: String?,
  ) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Publishing", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Progress while a location you scouted is sent and processed."
          setShowBadge(false)
        },
      )
    }

    val id = draftId.hashCode()
    val final = phase == "live" || phase == "rejected" || phase == "waiting"
    // Only show progress for a publish that is under way (as iOS starts activities).
    if (final && manager.activeNotifications.none { it.id == id }) return

    val photo = photos.getOrPut(draftId) { photoUri?.let { thumbnail(it) } }
    val link = if (recordId != null) "shootspot://records/$recordId" else "shootspot://profile"
    val open = PendingIntent.getActivity(
      context,
      id,
      Intent(Intent.ACTION_VIEW, Uri.parse(link))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    @Suppress("DEPRECATION")
    val builder =
      if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context)
    builder
      .setSmallIcon(R.drawable.publish_status)
      .setContentTitle(title(phase))
      .setContentText(if (final) detail(phase) else "$name · ${detail(phase)}")
      .setSubText(name)
      .setLargeIcon(photo)
      .setContentIntent(open)
      .setOnlyAlertOnce(true)
      .setOngoing(!final)
      .setAutoCancel(final)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_PROGRESS)
    if (phase != "rejected" && phase != "waiting") builder.setProgress(3, step(phase), false)
    if (final && Build.VERSION.SDK_INT >= 26) {
      builder.setTimeoutAfter(if (phase == "live") LINGER_LIVE_MS else LINGER_OTHER_MS)
    }
    try {
      manager.notify(id, builder.build())
    } catch (_: SecurityException) {}
    if (final) photos.remove(draftId)
  }

  /** A ~200 px copy of the photo for the notification. */
  private fun thumbnail(uri: String): Bitmap? = try {
    val path = Uri.parse(uri).path ?: uri
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sample = 1
    while (bounds.outHeight / (sample * 2) >= 200) sample *= 2
    BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
  } catch (_: Throwable) {
    null
  }
}
