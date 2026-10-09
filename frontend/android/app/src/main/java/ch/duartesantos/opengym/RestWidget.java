package ch.duartesantos.opengym;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.res.ColorStateList;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The rest timer on the Galaxy Z Flip cover screen (Flex Window). The cover screen shows a
 * notification's title and text but none of its progress bar or buttons, so the countdown also
 * draws itself here: the clock, the bar, Pause, −15 s, +15 s and Skip, the buttons going to the
 * same RestTimerService actions as the notification's. RestTimerService repaints it on every
 * tick and clears it when the rest ends. Added once by the user, from the cover screen's widget
 * list (Settings → Cover screen → Widgets); declared for it in rest_widget_samsung.xml.
 */
public class RestWidget extends AppWidgetProvider {
    // The last state painted, so a widget added (or the host redrawn) mid-rest shows the rest.
    private static RemoteViews last;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = last != null ? last : idle(ctx);
        try { mgr.updateAppWidget(ids, views); } catch (Exception ignored) { /* host gone */ }
    }

    /** A rest running or held: the clock, the bar and the controls. */
    static void show(Context ctx, long leftMs, long totalMs, boolean paused, String title,
                     String pause, String resume, String minus, String plus, String skip, int accent, int ink) {
        int max = (int) Math.max(1, Math.round(totalMs / 1000.0));
        int left = (int) Math.min(max, (Math.max(0, leftMs) + 999) / 1000);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.rest_widget);
        v.setTextViewText(R.id.rw_title, title == null || title.isEmpty() ? "Rest" : title);
        v.setTextViewText(R.id.rw_clock, RestAlert.clock(left));
        v.setViewVisibility(R.id.rw_bar, View.VISIBLE);
        v.setProgressBar(R.id.rw_bar, max, left, false);
        if (Build.VERSION.SDK_INT >= 31) {
            v.setColorStateList(R.id.rw_bar, "setProgressTintList", ColorStateList.valueOf(accent));
        }
        v.setViewVisibility(R.id.rw_controls, View.VISIBLE);
        v.setTextViewText(R.id.rw_pause, paused ? resume : pause);
        v.setTextViewText(R.id.rw_minus, minus);
        v.setTextViewText(R.id.rw_plus, plus);
        v.setTextViewText(R.id.rw_skip, skip);
        v.setTextColor(R.id.rw_pause, accent);
        v.setTextColor(R.id.rw_minus, accent);
        v.setTextColor(R.id.rw_plus, accent);
        v.setTextColor(R.id.rw_skip, ink);
        v.setInt(R.id.rw_skip, "setBackgroundColor", accent);
        v.setOnClickPendingIntent(R.id.rw_pause, RestAlert.control(ctx, RestAlert.ACTION_PAUSE, 61));
        v.setOnClickPendingIntent(R.id.rw_minus, RestAlert.control(ctx, RestAlert.ACTION_MINUS, 62));
        v.setOnClickPendingIntent(R.id.rw_plus, RestAlert.control(ctx, RestAlert.ACTION_PLUS, 63));
        v.setOnClickPendingIntent(R.id.rw_skip, RestAlert.control(ctx, RestAlert.ACTION_SKIP, 64));
        v.setOnClickPendingIntent(R.id.rw_root, RestAlert.openApp(ctx));
        push(ctx, v);
    }

    /** No rest running: the app's name and an empty clock. */
    static void clear(Context ctx) {
        push(ctx, idle(ctx));
    }

    private static RemoteViews idle(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.rest_widget);
        v.setOnClickPendingIntent(R.id.rw_root, RestAlert.openApp(ctx));
        return v;
    }

    private static void push(Context ctx, RemoteViews v) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            if (mgr == null) return;
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, RestWidget.class));
            // Kept even with no widget placed: one added mid-rest paints from it (onUpdate).
            last = v;
            if (ids == null || ids.length == 0) return;
            mgr.updateAppWidget(ids, v);
        } catch (Exception ignored) { /* no widget host */ }
    }
}
