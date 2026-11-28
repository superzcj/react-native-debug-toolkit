package com.reactnativedebugtoolkit;

import android.content.Context;
import android.graphics.Camera;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Interactive 3D layer visualizer inspired by Scalpel/FLEX 3D.
 * Uses Android's Camera + Matrix projection with zero external dependencies.
 */
final class ViewInspector3DView extends View {
  private static final int[] DEPTH_PALETTE = new int[] {
      Color.parseColor("#6638BDF8"),
      Color.parseColor("#66818CF8"),
      Color.parseColor("#6634D399"),
      Color.parseColor("#66FBBF24"),
      Color.parseColor("#66F472B6"),
      Color.parseColor("#66A78BFA"),
  };
  private static final class LayerEntry {
    final View view;
    final Rect bounds;
    final int depth;
    final boolean drawContent;
    final String label;

    LayerEntry(View view, Rect bounds, int depth, boolean drawContent, String label) {
      this.view = view;
      this.bounds = bounds;
      this.depth = depth;
      this.drawContent = drawContent;
      this.label = label;
    }
  }

  private final Camera camera = new Camera();
  private final Matrix matrix = new Matrix();
  private final List<LayerEntry> layers = new ArrayList<>();
  private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint selectedBorderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint selectedFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint labelBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final ScaleGestureDetector scaleDetector;

  private View selectedView;
  private float rotationY = -22f;
  private float rotationX = 14f;
  private float zoom = 0.68f;
  private float spacingDp = 16f;
  private boolean drawViews = true;
  private boolean drawLabels = false;
  private int maxDepth = 1;

  private float lastTouchX;
  private float lastTouchY;
  private boolean dragging;

  ViewInspector3DView(Context context) {
    super(context);
    setBackgroundColor(Color.parseColor("#E80B0F17"));

    borderPaint.setStyle(Paint.Style.STROKE);
    borderPaint.setStrokeWidth(Math.max(1f, ViewInspectorHelper.density(context)));

    selectedBorderPaint.setStyle(Paint.Style.STROKE);
    selectedBorderPaint.setStrokeWidth(ViewInspectorHelper.dpToPx(context, 2.5f));
    selectedBorderPaint.setColor(Color.parseColor("#60A5FA"));

    selectedFillPaint.setStyle(Paint.Style.FILL);
    selectedFillPaint.setColor(Color.parseColor("#3360A5FA"));

    labelPaint.setColor(Color.WHITE);
    labelPaint.setTextSize(ViewInspectorHelper.dpToPx(context, 9f));

    labelBgPaint.setStyle(Paint.Style.FILL);
    labelBgPaint.setColor(Color.parseColor("#B80F172A"));

    scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override
      public boolean onScale(ScaleGestureDetector detector) {
        zoom = Math.max(0.32f, Math.min(2.0f, zoom * detector.getScaleFactor()));
        invalidate();
        return true;
      }
    });
  }

  void capture(View root, View overlay, View selected) {
    this.selectedView = selected;
    layers.clear();
    maxDepth = 1;
    collectLayers(root, overlay, 0);
    // Stable sort by depth ascending so deeper layers always paint above shallower siblings.
    Collections.sort(layers, (a, b) -> Integer.compare(a.depth, b.depth));
    invalidate();
  }

  void clear() {
    layers.clear();
    selectedView = null;
    maxDepth = 1;
    invalidate();
  }

  void setSpacingDp(float spacingDp) {
    this.spacingDp = Math.max(0f, Math.min(48f, spacingDp));
    invalidate();
  }

  float getSpacingDp() {
    return spacingDp;
  }

  void toggleDrawViews() {
    drawViews = !drawViews;
    invalidate();
  }

  boolean isDrawViews() {
    return drawViews;
  }

  void toggleDrawLabels() {
    drawLabels = !drawLabels;
    invalidate();
  }

  boolean isDrawLabels() {
    return drawLabels;
  }

  void resetTransform() {
    rotationY = -22f;
    rotationX = 14f;
    zoom = 0.68f;
    spacingDp = 16f;
    invalidate();
  }

  private void collectLayers(View view, View overlay, int depth) {
    if (!ViewInspectorHelper.isInspectable(view, overlay)) return;
    if (view.getId() == android.R.id.statusBarBackground
        || view.getId() == android.R.id.navigationBarBackground) {
      return;
    }

    Rect bounds = ViewInspectorHelper.getRectInOverlay(view, overlay);
    boolean isLeaf = !(view instanceof ViewGroup) || ((ViewGroup) view).getChildCount() == 0;
    boolean isHardwareSurface = view instanceof SurfaceView || view instanceof TextureView;
    boolean hasBackground = view.getBackground() != null;

    if (depth > maxDepth) maxDepth = depth;
    if (isLeaf || isHardwareSurface || hasBackground || view == selectedView || depth <= 2) {
      String summary = ViewInspectorHelper.getShortSummary(view);
      String text = ViewInspectorHelper.getSimpleClassName(view);
      if (summary != null) text = text + " " + summary;
      layers.add(new LayerEntry(view, bounds, depth, isLeaf && !isHardwareSurface, text));
    }

    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) {
        collectLayers(group.getChildAt(i), overlay, depth + 1);
      }
    }
  }

  @Override
  public boolean onTouchEvent(MotionEvent event) {
    scaleDetector.onTouchEvent(event);
    if (scaleDetector.isInProgress()) {
      dragging = false;
      return true;
    }

    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        dragging = true;
        return true;
      case MotionEvent.ACTION_MOVE:
        if (dragging && event.getPointerCount() == 1) {
          float dx = event.getX() - lastTouchX;
          float dy = event.getY() - lastTouchY;
          rotationY = Math.max(-75f, Math.min(75f, rotationY + dx * 0.25f));
          rotationX = Math.max(-60f, Math.min(60f, rotationX - dy * 0.25f));
          lastTouchX = event.getX();
          lastTouchY = event.getY();
          invalidate();
        }
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
      case MotionEvent.ACTION_POINTER_UP:
        dragging = false;
        return true;
      default:
        return super.onTouchEvent(event);
    }
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0) return;

    float centerX = width * 0.5f;
    float centerY = height * 0.48f;
    float spacingPx = ViewInspectorHelper.dpToPx(getContext(), spacingDp);
    float centerDepth = maxDepth * 0.4f;
    float maxForwardZ = Math.max(0f, (maxDepth - centerDepth) * spacingPx);
    float maxRotatedHalfExtent = Math.max(width, height) * 0.75f;
    float cameraDistancePx = Math.max(24f * 72f, (maxForwardZ + maxRotatedHalfExtent) * 2.2f);
    float cameraLocationZ = -(cameraDistancePx / 72f);

    for (LayerEntry entry : layers) {
      float zOffset = -(entry.depth - centerDepth) * spacingPx;

      camera.save();
      camera.setLocation(0f, 0f, cameraLocationZ);
      camera.rotateX(rotationX);
      camera.rotateY(rotationY);
      camera.translate(0f, 0f, zOffset);
      camera.getMatrix(matrix);
      camera.restore();

      matrix.preTranslate(-centerX, -centerY);
      matrix.postScale(zoom, zoom);
      matrix.postTranslate(centerX, centerY);

      int saveCount = canvas.save();
      canvas.concat(matrix);

      Rect r = entry.bounds;
      if (drawViews) {
        drawLayerContent(canvas, entry);
      }

      boolean isSelected = entry.view == selectedView;
      if (isSelected) {
        canvas.drawRect(r, selectedFillPaint);
        canvas.drawRect(r, selectedBorderPaint);
      } else {
        borderPaint.setColor(depthColor(entry.depth));
        canvas.drawRect(r, borderPaint);
      }

      if (drawLabels || isSelected) {
        float pad = ViewInspectorHelper.dpToPx(getContext(), 2f);
        float tw = labelPaint.measureText(entry.label);
        float th = labelPaint.getTextSize();
        canvas.drawRect(r.left, r.top, r.left + tw + pad * 2, r.top + th + pad * 2, labelBgPaint);
        canvas.drawText(entry.label, r.left + pad, r.top + th, labelPaint);
      }

      canvas.restoreToCount(saveCount);
    }
  }

  private void drawLayerContent(Canvas canvas, LayerEntry entry) {
    if (entry.view instanceof SurfaceView || entry.view instanceof TextureView) {
      return;
    }
    if (!entry.view.isAttachedToWindow() || entry.view.getWidth() <= 0 || entry.view.getHeight() <= 0) {
      return;
    }
    int save = canvas.save();
    try {
      canvas.translate(entry.bounds.left, entry.bounds.top);
      canvas.clipRect(0, 0, entry.bounds.width(), entry.bounds.height());
      if (entry.drawContent) {
        entry.view.draw(canvas);
      } else {
        Drawable bg = entry.view.getBackground();
        if (bg != null) {
          bg.draw(canvas);
        }
      }
    } catch (RuntimeException ignored) {
      // Skip custom views that cannot render into a transformed software/hardware canvas pass.
    } finally {
      canvas.restoreToCount(save);
    }
  }

  private int depthColor(int depth) {
    return DEPTH_PALETTE[depth % DEPTH_PALETTE.length];
  }
}
