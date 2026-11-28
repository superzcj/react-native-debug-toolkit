package com.reactnativedebugtoolkit;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Insets;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.Collections;
import java.util.List;

/**
 * In-window native view inspector overlay attached directly to the current Activity's DecorView.
 * Requires no SYSTEM_ALERT_WINDOW permission and no third-party dependencies.
 */
final class ViewInspectorOverlay extends FrameLayout {
  enum Mode { BROWSE, SELECT, MEASURE, THREE_D }

  interface OnCloseListener {
    void onClosed();
  }

  private final ViewGroup decorView;
  private final OnCloseListener closeListener;

  private final OverlayCanvasView canvasView;
  private final ViewInspector3DView view3D;
  private final LinearLayout controls3D;
  private final TextView btn3DViews;
  private final TextView btn3DLabels;
  private final SeekBar spacingSeekBar;

  private final LinearLayout infoBar;
  private final TextView infoTitle;
  private final TextView infoMeta;
  private final TextView infoCycleBtn;
  private final TextView infoParentBtn;
  private final TextView infoPropsBtn;

  private final LinearLayout toolbar;
  private final TextView btnSelect;
  private final TextView btnMeasure;
  private final TextView btnTree;
  private final TextView btnProps;
  private final TextView btn3D;

  private final ViewInspectorSheet sheet;

  private Mode mode = Mode.SELECT;
  private List<View> currentHitStack = Collections.emptyList();
  private int currentHitIndex = 0;
  private View primaryView;
  private View secondaryView;

  private float toolbarDragOffsetY;
  private boolean draggingToolbar;
  private int insetTop;
  private int insetBottom;
  private int insetLeft;
  private int insetRight;

  ViewInspectorOverlay(Activity activity, OnCloseListener closeListener) {
    super(activity);
    this.decorView = (ViewGroup) activity.getWindow().getDecorView();
    this.closeListener = closeListener;
    this.insetTop = ViewInspectorHelper.dpToPx(activity, 36f);
    this.insetBottom = ViewInspectorHelper.dpToPx(activity, 16f);

    setElevation(ViewInspectorHelper.dpToPx(activity, 96f));
    setFocusable(true);
    setFocusableInTouchMode(true);

    canvasView = new OverlayCanvasView(activity);
    addView(canvasView, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

    view3D = new ViewInspector3DView(activity);
    view3D.setVisibility(View.GONE);
    addView(view3D, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

    controls3D = new LinearLayout(activity);
    controls3D.setOrientation(LinearLayout.HORIZONTAL);
    controls3D.setGravity(Gravity.CENTER_VERTICAL);
    controls3D.setBackground(pillDrawable(activity, Color.parseColor("#E6111827"), Color.parseColor("#334155"), 14f));
    int ctrlPadH = ViewInspectorHelper.dpToPx(activity, 12f);
    int ctrlPadV = ViewInspectorHelper.dpToPx(activity, 8f);
    controls3D.setPadding(ctrlPadH, ctrlPadV, ctrlPadH, ctrlPadV);
    controls3D.setVisibility(View.GONE);

    TextView spacingLabel = new TextView(activity);
    spacingLabel.setText(ViewInspectorHelper.label("层距", "Gap"));
    spacingLabel.setTextColor(Color.parseColor("#94A3B8"));
    spacingLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
    controls3D.addView(spacingLabel, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

    spacingSeekBar = new SeekBar(activity);
    spacingSeekBar.setMax(48);
    spacingSeekBar.setProgress(Math.round(view3D.getSpacingDp()));
    spacingSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
        if (fromUser) view3D.setSpacingDp(progress);
      }
      @Override public void onStartTrackingTouch(SeekBar bar) {}
      @Override public void onStopTrackingTouch(SeekBar bar) {}
    });
    controls3D.addView(spacingSeekBar, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

    btn3DViews = createSmallAction(activity, ViewInspectorHelper.label("内容", "Content"), v -> {
      view3D.toggleDrawViews();
      update3DControls();
    });
    btn3DLabels = createSmallAction(activity, ViewInspectorHelper.label("标签", "Labels"), v -> {
      view3D.toggleDrawLabels();
      update3DControls();
    });
    TextView btn3DReset = createSmallAction(activity, ViewInspectorHelper.label("重置", "Reset"), v -> {
      view3D.resetTransform();
      spacingSeekBar.setProgress(Math.round(view3D.getSpacingDp()));
    });
    controls3D.addView(btn3DViews);
    controls3D.addView(btn3DLabels);
    controls3D.addView(btn3DReset);

    LayoutParams ctrl3DParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP);
    ctrl3DParams.leftMargin = ViewInspectorHelper.dpToPx(activity, 12f);
    ctrl3DParams.rightMargin = ViewInspectorHelper.dpToPx(activity, 12f);
    ctrl3DParams.topMargin = ViewInspectorHelper.dpToPx(activity, 44f);
    addView(controls3D, ctrl3DParams);

    infoBar = new LinearLayout(activity);
    infoBar.setOrientation(LinearLayout.VERTICAL);
    infoBar.setBackground(pillDrawable(activity, Color.parseColor("#EC111827"), Color.parseColor("#334155"), 14f));
    int infoPadH = ViewInspectorHelper.dpToPx(activity, 12f);
    int infoPadV = ViewInspectorHelper.dpToPx(activity, 8f);
    infoBar.setPadding(infoPadH, infoPadV, infoPadH, infoPadV);
    infoBar.setVisibility(View.GONE);

    infoTitle = new TextView(activity);
    infoTitle.setTextColor(Color.WHITE);
    infoTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
    infoTitle.setTypeface(Typeface.DEFAULT_BOLD);
    infoTitle.setSingleLine(true);
    infoTitle.setEllipsize(TextUtils.TruncateAt.END);
    infoBar.addView(infoTitle, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

    LinearLayout infoRow = new LinearLayout(activity);
    infoRow.setOrientation(LinearLayout.HORIZONTAL);
    infoRow.setGravity(Gravity.CENTER_VERTICAL);
    LinearLayout.LayoutParams infoRowParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    infoRowParams.topMargin = ViewInspectorHelper.dpToPx(activity, 4f);

    infoMeta = new TextView(activity);
    infoMeta.setTextColor(Color.parseColor("#94A3B8"));
    infoMeta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
    infoMeta.setSingleLine(true);
    infoMeta.setEllipsize(TextUtils.TruncateAt.END);
    infoRow.addView(infoMeta, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

    infoCycleBtn = createSmallAction(activity, "", v -> cycleHitLayer());
    infoParentBtn = createSmallAction(activity, ViewInspectorHelper.label("父级", "Parent"), v -> selectParent());
    infoPropsBtn = createSmallAction(activity, ViewInspectorHelper.label("属性", "Props"), v -> openProperties());
    infoRow.addView(infoCycleBtn);
    infoRow.addView(infoParentBtn);
    infoRow.addView(infoPropsBtn);
    infoBar.addView(infoRow, infoRowParams);

    LayoutParams infoParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP);
    infoParams.leftMargin = ViewInspectorHelper.dpToPx(activity, 12f);
    infoParams.rightMargin = ViewInspectorHelper.dpToPx(activity, 12f);
    infoParams.topMargin = ViewInspectorHelper.dpToPx(activity, 44f);
    addView(infoBar, infoParams);

    toolbar = new LinearLayout(activity);
    toolbar.setOrientation(LinearLayout.HORIZONTAL);
    toolbar.setGravity(Gravity.CENTER_VERTICAL);
    toolbar.setBackground(pillDrawable(activity, Color.parseColor("#F0111827"), Color.parseColor("#3B475E"), 22f));
    int tbPadH = ViewInspectorHelper.dpToPx(activity, 8f);
    int tbPadV = ViewInspectorHelper.dpToPx(activity, 6f);
    toolbar.setPadding(tbPadH, tbPadV, tbPadH, tbPadV);
    toolbar.setElevation(ViewInspectorHelper.dpToPx(activity, 8f));

    TextView dragHandle = new TextView(activity);
    dragHandle.setText("⋮⋮");
    dragHandle.setTextColor(Color.parseColor("#64748B"));
    dragHandle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
    dragHandle.setPadding(ViewInspectorHelper.dpToPx(activity, 6f), 0, ViewInspectorHelper.dpToPx(activity, 4f), 0);
    dragHandle.setOnTouchListener((v, event) -> handleToolbarDrag(event));
    toolbar.addView(dragHandle);

    btnSelect = createToolbarButton(activity, ViewInspectorHelper.label("点选", "Select"),
        v -> setMode(mode == Mode.SELECT ? Mode.BROWSE : Mode.SELECT));
    btnMeasure = createToolbarButton(activity, ViewInspectorHelper.label("测距", "Measure"),
        v -> setMode(mode == Mode.MEASURE ? Mode.BROWSE : Mode.MEASURE));
    btnTree = createToolbarButton(activity, ViewInspectorHelper.label("视图树", "Tree"), v -> openHierarchy());
    btnProps = createToolbarButton(activity, ViewInspectorHelper.label("属性", "Props"), v -> openProperties());
    btn3D = createToolbarButton(activity, "3D", v -> setMode(mode == Mode.THREE_D ? Mode.SELECT : Mode.THREE_D));
    TextView btnClose = createToolbarButton(activity, "✕", v -> dismiss());
    btnClose.setTextColor(Color.parseColor("#FCA5A5"));

    toolbar.addView(btnSelect);
    toolbar.addView(btnMeasure);
    toolbar.addView(btnTree);
    toolbar.addView(btnProps);
    toolbar.addView(btn3D);
    toolbar.addView(btnClose);

    LayoutParams toolbarParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
    toolbarParams.bottomMargin = ViewInspectorHelper.dpToPx(activity, 32f);
    addView(toolbar, toolbarParams);

    sheet = new ViewInspectorSheet(activity, new ViewInspectorSheet.Listener() {
      @Override public void onSelectView(View view, boolean openProps) {
        selectSingleView(view);
        if (openProps) {
          sheet.showProperties(getInspectRoot(), ViewInspectorOverlay.this, view);
        }
      }

      @Override public void onViewMutated(View view) {
        canvasView.invalidate();
        updateInfoBar();
      }

      @Override public void onDismiss() {
        sheet.hide();
        if (mode != Mode.BROWSE) {
          requestFocus();
        }
      }
    });
    sheet.setVisibility(View.GONE);
    addView(sheet, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

    setOnApplyWindowInsetsListener((v, insets) -> {
      updateInsetsFromWindow(insets);
      return insets;
    });

    applyInsetsLayout();
    updateModeButtons();
    update3DControls();
  }

  private void updateInsetsFromWindow(WindowInsets insets) {
    if (insets == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
      insetTop = bars.top;
      insetBottom = bars.bottom;
      insetLeft = bars.left;
      insetRight = bars.right;
    } else {
      insetTop = insets.getSystemWindowInsetTop();
      insetBottom = insets.getSystemWindowInsetBottom();
      insetLeft = insets.getSystemWindowInsetLeft();
      insetRight = insets.getSystemWindowInsetRight();
    }
    applyInsetsLayout();
  }

  private void applyInsetsLayout() {
    Context context = getContext();
    int sidePad = ViewInspectorHelper.dpToPx(context, 12f);
    int topPad = insetTop + ViewInspectorHelper.dpToPx(context, 8f);
    int bottomPad = insetBottom + ViewInspectorHelper.dpToPx(context, 16f);

    LayoutParams ctrl3DParams = (LayoutParams) controls3D.getLayoutParams();
    if (ctrl3DParams != null) {
      ctrl3DParams.leftMargin = insetLeft + sidePad;
      ctrl3DParams.rightMargin = insetRight + sidePad;
      ctrl3DParams.topMargin = topPad;
      controls3D.setLayoutParams(ctrl3DParams);
    }

    LayoutParams toolbarParams = (LayoutParams) toolbar.getLayoutParams();
    if (toolbarParams != null) {
      toolbarParams.bottomMargin = bottomPad;
      toolbar.setLayoutParams(toolbarParams);
    }

    sheet.updateInsets(insetBottom);
    if (primaryView != null && mode != Mode.THREE_D && mode != Mode.BROWSE) {
      updateInfoBar();
    }
  }

  void attach() {
    if (getParent() == null) {
      decorView.addView(this, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }
    bringToFront();
    requestApplyInsets();
    if (mode != Mode.BROWSE) {
      requestFocus();
    }
  }

  void dismiss() {
    sheet.hide();
    view3D.clear();
    primaryView = null;
    secondaryView = null;
    currentHitStack = Collections.emptyList();
    currentHitIndex = 0;
    if (getParent() instanceof ViewGroup) {
      ((ViewGroup) getParent()).removeView(this);
    }
    closeListener.onClosed();
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
      if (mode == Mode.BROWSE && sheet.getVisibility() != View.VISIBLE) {
        return super.dispatchKeyEvent(event);
      }
      if (event.getAction() == KeyEvent.ACTION_DOWN) {
        return true;
      }
      if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
        if (sheet.getVisibility() == View.VISIBLE) {
          sheet.hide();
          if (mode != Mode.BROWSE) {
            requestFocus();
          }
          return true;
        }
        if (mode == Mode.THREE_D) {
          setMode(Mode.SELECT);
          requestFocus();
          return true;
        }
        dismiss();
        return true;
      }
    }
    return super.dispatchKeyEvent(event);
  }

  private void pruneDetachedViews() {
    if (primaryView != null && !primaryView.isAttachedToWindow()) {
      primaryView = null;
      currentHitStack = Collections.emptyList();
      currentHitIndex = 0;
    }
    if (secondaryView != null && !secondaryView.isAttachedToWindow()) {
      secondaryView = null;
    }
  }

  private View getInspectRoot() {
    View content = decorView.findViewById(android.R.id.content);
    return content != null ? content : decorView;
  }

  private void setMode(Mode nextMode) {
    mode = nextMode;
    if (mode != Mode.MEASURE) {
      secondaryView = null;
    }
    if (mode == Mode.THREE_D) {
      sheet.hide();
      infoBar.setVisibility(View.GONE);
      view3D.setVisibility(View.VISIBLE);
      controls3D.setVisibility(View.VISIBLE);
      pruneDetachedViews();
      view3D.capture(getInspectRoot(), this, primaryView);
      requestFocus();
    } else if (mode == Mode.BROWSE) {
      sheet.hide();
      view3D.clear();
      view3D.setVisibility(View.GONE);
      controls3D.setVisibility(View.GONE);
      infoBar.setVisibility(View.GONE);
      clearFocus();
    } else {
      view3D.clear();
      view3D.setVisibility(View.GONE);
      controls3D.setVisibility(View.GONE);
      updateInfoBar();
      requestFocus();
    }
    updateModeButtons();
    canvasView.invalidate();
  }

  private void updateModeButtons() {
    styleToolbarButton(btnSelect, mode == Mode.SELECT);
    styleToolbarButton(btnMeasure, mode == Mode.MEASURE);
    styleToolbarButton(btnTree, false);
    styleToolbarButton(btnProps, false);
    styleToolbarButton(btn3D, mode == Mode.THREE_D);
  }

  private void update3DControls() {
    styleSmallAction(btn3DViews, view3D.isDrawViews());
    styleSmallAction(btn3DLabels, view3D.isDrawLabels());
  }

  private void handleCanvasTap(float x, float y) {
    pruneDetachedViews();
    List<View> hits = ViewInspectorHelper.hitTestStack(getInspectRoot(), this, x, y);
    if (hits.isEmpty()) {
      if (mode == Mode.SELECT) {
        primaryView = null;
        currentHitStack = Collections.emptyList();
        currentHitIndex = 0;
      } else if (mode == Mode.MEASURE) {
        secondaryView = null;
      }
      updateInfoBar();
      canvasView.invalidate();
      return;
    }

    View target = hits.get(0);
    if (mode == Mode.MEASURE && primaryView != null && target != primaryView) {
      secondaryView = target;
    } else {
      currentHitStack = hits;
      currentHitIndex = 0;
      primaryView = target;
      if (mode == Mode.MEASURE) secondaryView = null;
    }
    updateInfoBar();
    canvasView.invalidate();
  }

  private void selectSingleView(View view) {
    primaryView = view;
    secondaryView = null;
    currentHitStack = Collections.singletonList(view);
    currentHitIndex = 0;
    if (mode == Mode.THREE_D || mode == Mode.BROWSE) {
      setMode(Mode.SELECT);
    } else {
      updateInfoBar();
      canvasView.invalidate();
    }
  }

  private void cycleHitLayer() {
    if (currentHitStack.size() <= 1) return;
    currentHitIndex = (currentHitIndex + 1) % currentHitStack.size();
    primaryView = currentHitStack.get(currentHitIndex);
    updateInfoBar();
    canvasView.invalidate();
  }

  private void selectParent() {
    pruneDetachedViews();
    if (primaryView == null) return;
    if (primaryView.getParent() instanceof View && primaryView.getParent() != this && primaryView != getInspectRoot()) {
      selectSingleView((View) primaryView.getParent());
    }
  }

  private void openHierarchy() {
    pruneDetachedViews();
    if (mode == Mode.THREE_D) setMode(Mode.SELECT);
    sheet.showHierarchy(getInspectRoot(), this, primaryView);
    requestFocus();
  }

  private void openProperties() {
    pruneDetachedViews();
    View target = primaryView != null ? primaryView : getInspectRoot();
    if (mode == Mode.THREE_D) setMode(Mode.SELECT);
    sheet.showProperties(getInspectRoot(), this, target);
    requestFocus();
  }

  private void updateInfoBar() {
    pruneDetachedViews();
    if (mode == Mode.THREE_D || mode == Mode.BROWSE || primaryView == null) {
      infoBar.setVisibility(View.GONE);
      return;
    }

    Context context = getContext();
    Rect rect = ViewInspectorHelper.getRectInOverlay(primaryView, this);
    StringBuilder title = new StringBuilder(ViewInspectorHelper.getSimpleClassName(primaryView));
    title.append("  ")
        .append(ViewInspectorHelper.formatDp(context, rect.width()))
        .append(" × ")
        .append(ViewInspectorHelper.formatDp(context, rect.height()));
    if (mode == Mode.MEASURE && secondaryView != null) {
      title.append("  ↔  ").append(ViewInspectorHelper.getSimpleClassName(secondaryView));
    }
    infoTitle.setText(title.toString());

    String summary = ViewInspectorHelper.getShortSummary(primaryView);
    StringBuilder meta = new StringBuilder();
    meta.append("(")
        .append(ViewInspectorHelper.formatDp(context, rect.left))
        .append(", ")
        .append(ViewInspectorHelper.formatDp(context, rect.top))
        .append(")");
    if (mode == Mode.MEASURE && secondaryView == null) {
      meta.append("  ").append(ViewInspectorHelper.label("再点另一个视图测量间距", "Tap another view to measure"));
      if (!TextUtils.isEmpty(summary)) {
        meta.append("  ·  ").append(summary);
      }
    } else if (!TextUtils.isEmpty(summary)) {
      meta.append("  ").append(summary);
    }
    infoMeta.setText(meta.toString());

    if (currentHitStack.size() > 1) {
      infoCycleBtn.setVisibility(View.VISIBLE);
      infoCycleBtn.setText(ViewInspectorHelper.label("层 ", "L ") + (currentHitIndex + 1) + "/" + currentHitStack.size());
    } else {
      infoCycleBtn.setVisibility(View.GONE);
    }
    boolean hasParent = primaryView.getParent() instanceof View && primaryView != getInspectRoot();
    infoParentBtn.setVisibility(hasParent ? View.VISIBLE : View.GONE);
    infoPropsBtn.setVisibility(View.VISIBLE);

    // Position the info card away from the selected view.
    LayoutParams params = (LayoutParams) infoBar.getLayoutParams();
    int sidePad = ViewInspectorHelper.dpToPx(context, 12f);
    params.leftMargin = insetLeft + sidePad;
    params.rightMargin = insetRight + sidePad;
    int halfHeight = getHeight() > 0 ? getHeight() / 2 : 800;
    int topThreshold = insetTop + ViewInspectorHelper.dpToPx(context, 96f);
    if (rect.top < topThreshold && rect.bottom < halfHeight + ViewInspectorHelper.dpToPx(context, 100f)) {
      params.gravity = Gravity.BOTTOM;
      params.topMargin = 0;
      params.bottomMargin = insetBottom + ViewInspectorHelper.dpToPx(context, 76f);
    } else {
      params.gravity = Gravity.TOP;
      params.topMargin = insetTop + ViewInspectorHelper.dpToPx(context, 8f);
      params.bottomMargin = 0;
    }
    infoBar.setLayoutParams(params);
    infoBar.setVisibility(View.VISIBLE);
  }

  private boolean handleToolbarDrag(MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        toolbarDragOffsetY = toolbar.getTranslationY() - event.getRawY();
        draggingToolbar = true;
        return true;
      case MotionEvent.ACTION_MOVE:
        if (draggingToolbar) {
          float nextTy = event.getRawY() + toolbarDragOffsetY;
          float maxTy = ViewInspectorHelper.dpToPx(getContext(), 8f);
          float availableTravel = getHeight() - toolbar.getHeight() - insetTop - insetBottom - ViewInspectorHelper.dpToPx(getContext(), 40f);
          float minTy = Math.min(maxTy, -Math.max(0f, availableTravel));
          toolbar.setTranslationY(Math.max(minTy, Math.min(maxTy, nextTy)));
        }
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        draggingToolbar = false;
        return true;
      default:
        return false;
    }
  }

  private TextView createToolbarButton(Context context, String text, OnClickListener listener) {
    TextView tv = new TextView(context);
    tv.setText(text);
    tv.setTextColor(Color.parseColor("#E2E8F0"));
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
    tv.setTypeface(Typeface.DEFAULT_BOLD);
    int padH = ViewInspectorHelper.dpToPx(context, 10f);
    int padV = ViewInspectorHelper.dpToPx(context, 7f);
    tv.setPadding(padH, padV, padH, padV);
    tv.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.leftMargin = ViewInspectorHelper.dpToPx(context, 2f);
    params.rightMargin = ViewInspectorHelper.dpToPx(context, 2f);
    tv.setLayoutParams(params);
    return tv;
  }

  private void styleToolbarButton(TextView tv, boolean active) {
    if (active) {
      tv.setBackground(pillDrawable(getContext(), Color.parseColor("#2563EB"), Color.TRANSPARENT, 14f));
      tv.setTextColor(Color.WHITE);
    } else {
      tv.setBackground(null);
      tv.setTextColor(Color.parseColor("#CBD5E1"));
    }
  }

  private TextView createSmallAction(Context context, String text, OnClickListener listener) {
    TextView tv = new TextView(context);
    tv.setText(text);
    tv.setTextColor(Color.parseColor("#93C5FD"));
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
    tv.setBackground(pillDrawable(context, Color.parseColor("#1E293B"), Color.parseColor("#334155"), 8f));
    int padH = ViewInspectorHelper.dpToPx(context, 8f);
    int padV = ViewInspectorHelper.dpToPx(context, 4f);
    tv.setPadding(padH, padV, padH, padV);
    tv.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.leftMargin = ViewInspectorHelper.dpToPx(context, 6f);
    tv.setLayoutParams(params);
    return tv;
  }

  private void styleSmallAction(TextView tv, boolean active) {
    tv.setBackground(pillDrawable(
        getContext(),
        active ? Color.parseColor("#2563EB") : Color.parseColor("#1E293B"),
        active ? Color.TRANSPARENT : Color.parseColor("#334155"),
        8f));
    tv.setTextColor(active ? Color.WHITE : Color.parseColor("#93C5FD"));
  }

  private static GradientDrawable pillDrawable(Context context, int fill, int stroke, float radiusDp) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fill);
    drawable.setCornerRadius(ViewInspectorHelper.dpToPx(context, radiusDp));
    if (stroke != Color.TRANSPARENT) {
      drawable.setStroke(Math.max(1, ViewInspectorHelper.dpToPx(context, 1f)), stroke);
    }
    return drawable;
  }

  private final class OverlayCanvasView extends View {
    private final Paint primaryStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint primaryFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint secondaryStroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint secondaryFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint paddingFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint marginFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint guideLine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint measureLine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint badgeBg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint badgeText = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF badgeRect = new RectF();

    OverlayCanvasView(Context context) {
      super(context);
      float dp = ViewInspectorHelper.density(context);

      primaryStroke.setStyle(Paint.Style.STROKE);
      primaryStroke.setStrokeWidth(2f * dp);
      primaryStroke.setColor(Color.parseColor("#3B82F6"));

      primaryFill.setStyle(Paint.Style.FILL);
      primaryFill.setColor(Color.parseColor("#203B82F6"));

      secondaryStroke.setStyle(Paint.Style.STROKE);
      secondaryStroke.setStrokeWidth(2f * dp);
      secondaryStroke.setColor(Color.parseColor("#F59E0B"));

      secondaryFill.setStyle(Paint.Style.FILL);
      secondaryFill.setColor(Color.parseColor("#20F59E0B"));

      paddingFill.setStyle(Paint.Style.FILL);
      paddingFill.setColor(Color.parseColor("#3810B981"));

      marginFill.setStyle(Paint.Style.FILL);
      marginFill.setColor(Color.parseColor("#38F97316"));

      guideLine.setStyle(Paint.Style.STROKE);
      guideLine.setStrokeWidth(1.2f * dp);
      guideLine.setColor(Color.parseColor("#CCEF4444"));
      guideLine.setPathEffect(new DashPathEffect(new float[] { 4f * dp, 3f * dp }, 0f));

      measureLine.setStyle(Paint.Style.STROKE);
      measureLine.setStrokeWidth(1.5f * dp);
      measureLine.setColor(Color.parseColor("#EF4444"));

      badgeBg.setStyle(Paint.Style.FILL);
      badgeBg.setColor(Color.parseColor("#E6DC2626"));

      badgeText.setColor(Color.WHITE);
      badgeText.setTextSize(10f * dp);
      badgeText.setTypeface(Typeface.DEFAULT_BOLD);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
      if (mode == Mode.THREE_D || mode == Mode.BROWSE) return false;
      if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
        return true;
      }
      if (event.getActionMasked() == MotionEvent.ACTION_UP) {
        handleCanvasTap(event.getX(), event.getY());
        return true;
      }
      return super.onTouchEvent(event);
    }

    @Override
    protected void onDraw(Canvas canvas) {
      super.onDraw(canvas);
      pruneDetachedViews();
      if (mode == Mode.THREE_D || mode == Mode.BROWSE || primaryView == null) return;

      Rect a = ViewInspectorHelper.getRectInOverlay(primaryView, ViewInspectorOverlay.this);
      drawBoxModel(canvas, primaryView, a);
      canvas.drawRect(a, primaryFill);
      canvas.drawRect(a, primaryStroke);

      if (mode == Mode.MEASURE && secondaryView != null) {
        Rect b = ViewInspectorHelper.getRectInOverlay(secondaryView, ViewInspectorOverlay.this);
        canvas.drawRect(b, secondaryFill);
        canvas.drawRect(b, secondaryStroke);
        drawSpacingBetween(canvas, a, b);
      } else if (primaryView.getParent() instanceof View && primaryView != getInspectRoot()) {
        Rect parentRect = ViewInspectorHelper.getRectInOverlay((View) primaryView.getParent(), ViewInspectorOverlay.this);
        drawSpacingToContainer(canvas, a, parentRect);
      }
    }

    private void drawBoxModel(Canvas canvas, View view, Rect rect) {
      ViewGroup.LayoutParams lp = view.getLayoutParams();
      if (lp instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        if (mlp.leftMargin > 0) canvas.drawRect(rect.left - mlp.leftMargin, rect.top, rect.left, rect.bottom, marginFill);
        if (mlp.rightMargin > 0) canvas.drawRect(rect.right, rect.top, rect.right + mlp.rightMargin, rect.bottom, marginFill);
        if (mlp.topMargin > 0) canvas.drawRect(rect.left - mlp.leftMargin, rect.top - mlp.topMargin, rect.right + mlp.rightMargin, rect.top, marginFill);
        if (mlp.bottomMargin > 0) canvas.drawRect(rect.left - mlp.leftMargin, rect.bottom, rect.right + mlp.rightMargin, rect.bottom + mlp.bottomMargin, marginFill);
      }

      int pl = view.getPaddingLeft();
      int pr = view.getPaddingRight();
      int pt = view.getPaddingTop();
      int pb = view.getPaddingBottom();
      if (pl > 0) canvas.drawRect(rect.left, rect.top, rect.left + pl, rect.bottom, paddingFill);
      if (pr > 0) canvas.drawRect(rect.right - pr, rect.top, rect.right, rect.bottom, paddingFill);
      if (pt > 0) canvas.drawRect(rect.left + pl, rect.top, rect.right - pr, rect.top + pt, paddingFill);
      if (pb > 0) canvas.drawRect(rect.left + pl, rect.bottom - pb, rect.right - pr, rect.bottom, paddingFill);
    }

    private void drawSpacingToContainer(Canvas canvas, Rect inner, Rect outer) {
      int midX = (inner.left + inner.right) / 2;
      int midY = (inner.top + inner.bottom) / 2;
      if (inner.left > outer.left) drawDimensionLine(canvas, outer.left, midY, inner.left, midY);
      if (outer.right > inner.right) drawDimensionLine(canvas, inner.right, midY, outer.right, midY);
      if (inner.top > outer.top) drawDimensionLine(canvas, midX, outer.top, midX, inner.top);
      if (outer.bottom > inner.bottom) drawDimensionLine(canvas, midX, inner.bottom, midX, outer.bottom);
    }

    private void drawSpacingBetween(Canvas canvas, Rect a, Rect b) {
      if (a.contains(b)) {
        drawSpacingToContainer(canvas, b, a);
        return;
      }
      if (b.contains(a)) {
        drawSpacingToContainer(canvas, a, b);
        return;
      }

      // Horizontal gap when disjoint horizontally.
      if (b.left >= a.right) {
        int y = overlapCenter(a.top, a.bottom, b.top, b.bottom);
        drawGuideIfNeeded(canvas, b.left, y, b.top, b.bottom);
        drawDimensionLine(canvas, a.right, y, b.left, y);
      } else if (a.left >= b.right) {
        int y = overlapCenter(a.top, a.bottom, b.top, b.bottom);
        drawGuideIfNeeded(canvas, b.right, y, b.top, b.bottom);
        drawDimensionLine(canvas, b.right, y, a.left, y);
      }

      // Vertical gap when disjoint vertically.
      if (b.top >= a.bottom) {
        int x = overlapCenter(a.left, a.right, b.left, b.right);
        drawGuideIfNeededHorizontal(canvas, x, b.top, b.left, b.right);
        drawDimensionLine(canvas, x, a.bottom, x, b.top);
      } else if (a.top >= b.bottom) {
        int x = overlapCenter(a.left, a.right, b.left, b.right);
        drawGuideIfNeededHorizontal(canvas, x, b.bottom, b.left, b.right);
        drawDimensionLine(canvas, x, b.bottom, x, a.top);
      }
    }

    private int overlapCenter(int start1, int end1, int start2, int end2) {
      int overlapStart = Math.max(start1, start2);
      int overlapEnd = Math.min(end1, end2);
      if (overlapStart <= overlapEnd) {
        return (overlapStart + overlapEnd) / 2;
      }
      return (start1 + end1) / 2;
    }

    private void drawGuideIfNeeded(Canvas canvas, int x, int y, int minY, int maxY) {
      if (y < minY) canvas.drawLine(x, y, x, minY, guideLine);
      else if (y > maxY) canvas.drawLine(x, maxY, x, y, guideLine);
    }

    private void drawGuideIfNeededHorizontal(Canvas canvas, int x, int y, int minX, int maxX) {
      if (x < minX) canvas.drawLine(x, y, minX, y, guideLine);
      else if (x > maxX) canvas.drawLine(maxX, y, x, y, guideLine);
    }

    private void drawDimensionLine(Canvas canvas, float x1, float y1, float x2, float y2) {
      float distance = (float) Math.hypot(x2 - x1, y2 - y1);
      if (distance < 1f) return;

      canvas.drawLine(x1, y1, x2, y2, measureLine);
      float tick = ViewInspectorHelper.dpToPx(getContext(), 3.5f);
      if (Math.abs(y1 - y2) < 1f) {
        canvas.drawLine(x1, y1 - tick, x1, y1 + tick, measureLine);
        canvas.drawLine(x2, y2 - tick, x2, y2 + tick, measureLine);
      } else {
        canvas.drawLine(x1 - tick, y1, x1 + tick, y1, measureLine);
        canvas.drawLine(x2 - tick, y2, x2 + tick, y2, measureLine);
      }

      String label = ViewInspectorHelper.formatDp(getContext(), distance);
      float textW = badgeText.measureText(label);
      float textH = badgeText.getTextSize();
      float padH = ViewInspectorHelper.dpToPx(getContext(), 4f);
      float padV = ViewInspectorHelper.dpToPx(getContext(), 2f);
      float cx = (x1 + x2) * 0.5f;
      float cy = (y1 + y2) * 0.5f;

      badgeRect.set(
          cx - textW * 0.5f - padH,
          cy - textH * 0.5f - padV,
          cx + textW * 0.5f + padH,
          cy + textH * 0.5f + padV);
      float r = ViewInspectorHelper.dpToPx(getContext(), 4f);
      canvas.drawRoundRect(badgeRect, r, r, badgeBg);
      canvas.drawText(label, cx - textW * 0.5f, cy + textH * 0.35f, badgeText);
    }
  }
}
