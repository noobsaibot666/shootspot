package com.shootspot.app.quick

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.RemoteViews
import com.shootspot.app.R

// Android quick actions (the iOS widgets, controls and Siri phrases live in targets/widget).
// Everything opens shootspot://quick/<scout|nearby>; src/app/quick/[action].tsx does the rest
// (sign-in gate, then the camera or the Feed scoped to Nearby). Copied into the app by
// plugins/with-android-quick-actions.js; never edit the generated android/ folder.

enum class QuickAction(val path: String, val title: Int, val subtitle: Int, val icon: Int) {
  SCOUT("scout", R.string.quick_scout, R.string.quick_scout_sub, R.drawable.quick_camera),
  NEARBY("nearby", R.string.quick_nearby, R.string.quick_nearby_sub, R.drawable.quick_pin);

  fun intent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("shootspot://quick/$path"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  fun pending(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      ordinal,
      intent(context),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

// MARK: Home-screen widgets (static launchers: no sign-in or location in the widget)

abstract class SingleActionWidget(private val action: QuickAction) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.quick_widget_single).apply {
      setImageViewResource(R.id.quick_icon, action.icon)
      setTextViewText(R.id.quick_title, context.getString(action.title))
      setTextViewText(R.id.quick_sub, context.getString(action.subtitle))
      setContentDescription(R.id.quick_root, context.getString(action.title))
      setOnClickPendingIntent(R.id.quick_root, action.pending(context))
    }
    ids.forEach { manager.updateAppWidget(it, views) }
  }
}

class ScoutWidget : SingleActionWidget(QuickAction.SCOUT)

class NearbyWidget : SingleActionWidget(QuickAction.NEARBY)

class QuickActionsWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.quick_widget_both).apply {
      setOnClickPendingIntent(R.id.quick_scout, QuickAction.SCOUT.pending(context))
      setOnClickPendingIntent(R.id.quick_nearby, QuickAction.NEARBY.pending(context))
    }
    ids.forEach { manager.updateAppWidget(it, views) }
  }
}

// MARK: Quick Settings tiles (the pull-down panel; Android's Control Center)

abstract class QuickTile(private val action: QuickAction) : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    val open = {
      if (Build.VERSION.SDK_INT >= 34) {
        startActivityAndCollapse(action.pending(this))
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(action.intent(this))
      }
    }
    if (isLocked) unlockAndRun(open) else open()
  }
}

class ScoutTile : QuickTile(QuickAction.SCOUT)

class NearbyTile : QuickTile(QuickAction.NEARBY)
