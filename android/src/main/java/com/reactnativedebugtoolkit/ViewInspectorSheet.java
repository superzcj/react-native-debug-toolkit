package com.reactnativedebugtoolkit;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;
import java.util.Locale;

/**
 * Bottom sheet panel for the native View Hierarchy tree and live View Properties editor.
 */
final class ViewInspectorSheet extends FrameLayout {
  interface Listener {
    void onSelectView(View view, boolean openProperties);
    void onViewMutated(View view);
    void onDismiss();
  }

  private final Listener listener;
  private final LinearLayout card;
  private final TextView titleView;
  private final LinearLayout headerActions;
  private final EditText searchInput;
  private final ScrollView scrollView;
  private final LinearLayout contentContainer;

  private View rootView;
  private View overlayView;
  private View currentView;
  private List<ViewInspectorHelper.TreeNode> cachedNodes;
  private boolean showingTree;
  private boolean suppressSearchWatcher;
  private Runnable pendingSearchRunnable;
  private int bottomInsetPx;

  ViewInspectorSheet(Context context, Listener listener) {
    super(context);
    this.listener = listener;
    setBackgroundColor(Color.parseColor("#7A000000"));
    setClickable(true);
    setOnClickListener(v -> listener.onDismiss());

    card = new LinearLayout(context);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setClickable(true);
    card.setBackground(roundedRect(context, Color.parseColor("#111827"), Color.parseColor("#2A3447"), 18f, true));

    int screenHeight = context.getResources().getDisplayMetrics().heightPixels;
    LayoutParams cardParams = new LayoutParams(
        LayoutParams.MATCH_PARENT,
        Math.round(screenHeight * 0.62f),
        Gravity.BOTTOM);
    addView(card, cardParams);

    View handle = new View(context);
    handle.setBackground(roundedRect(context, Color.parseColor("#475569"), Color.TRANSPARENT, 3f, false));
    LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(
        ViewInspectorHelper.dpToPx(context, 40f),
        ViewInspectorHelper.dpToPx(context, 4f));
    handleParams.gravity = Gravity.CENTER_HORIZONTAL;
    handleParams.topMargin = ViewInspectorHelper.dpToPx(context, 10f);
    handleParams.bottomMargin = ViewInspectorHelper.dpToPx(context, 8f);
    card.addView(handle, handleParams);

    LinearLayout header = new LinearLayout(context);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    int padH = ViewInspectorHelper.dpToPx(context, 16f);
    int padV = ViewInspectorHelper.dpToPx(context, 6f);
    header.setPadding(padH, padV, padH, padV);
    card.addView(header, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

    titleView = new TextView(context);
    titleView.setTextColor(Color.WHITE);
    titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
    titleView.setTypeface(Typeface.DEFAULT_BOLD);
    titleView.setSingleLine(true);
    titleView.setEllipsize(TextUtils.TruncateAt.END);
    header.addView(titleView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

    headerActions = new LinearLayout(context);
    headerActions.setOrientation(LinearLayout.HORIZONTAL);
    headerActions.setGravity(Gravity.CENTER_VERTICAL);
    header.addView(headerActions, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

    searchInput = new EditText(context);
    searchInput.setHint(ViewInspectorHelper.label("搜索类名 / testID / 文本…", "Filter by class / testID / text…"));
    searchInput.setHintTextColor(Color.parseColor("#64748B"));
    searchInput.setTextColor(Color.WHITE);
    searchInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
    searchInput.setSingleLine(true);
    searchInput.setBackground(roundedRect(context, Color.parseColor("#1E293B"), Color.parseColor("#334155"), 10f, false));
    int searchPadH = ViewInspectorHelper.dpToPx(context, 12f);
    int searchPadV = ViewInspectorHelper.dpToPx(context, 8f);
    searchInput.setPadding(searchPadH, searchPadV, searchPadH, searchPadV);
    LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    searchParams.leftMargin = padH;
    searchParams.rightMargin = padH;
    searchParams.bottomMargin = ViewInspectorHelper.dpToPx(context, 8f);
    card.addView(searchInput, searchParams);

    searchInput.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
        if (!showingTree || suppressSearchWatcher) return;
        cancelPendingSearch();
        final String query = s == null ? "" : s.toString();
        pendingSearchRunnable = () -> {
          pendingSearchRunnable = null;
          if (showingTree) renderTree(query);
        };
        postDelayed(pendingSearchRunnable, 100L);
      }
      @Override public void afterTextChanged(Editable s) {}
    });

    View divider = new View(context);
    divider.setBackgroundColor(Color.parseColor("#1F2937"));
    card.addView(divider, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1));

    scrollView = new ScrollView(context);
    scrollView.setFillViewport(true);
    card.addView(scrollView, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

    contentContainer = new LinearLayout(context);
    contentContainer.setOrientation(LinearLayout.VERTICAL);
    contentContainer.setPadding(padH, ViewInspectorHelper.dpToPx(context, 10f), padH, ViewInspectorHelper.dpToPx(context, 24f));
    scrollView.addView(contentContainer, new LayoutParams(
        LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    if (h > 0 && h != oldh) {
      LayoutParams params = (LayoutParams) card.getLayoutParams();
      int targetHeight = Math.round(h * 0.62f);
      if (params != null && params.height != targetHeight) {
        params.height = targetHeight;
        card.setLayoutParams(params);
      }
    }
  }

  void updateInsets(int bottomInsetPx) {
    int safeBottom = Math.max(0, bottomInsetPx);
    if (this.bottomInsetPx == safeBottom) return;
    this.bottomInsetPx = safeBottom;
    int padH = ViewInspectorHelper.dpToPx(getContext(), 16f);
    contentContainer.setPadding(
        padH,
        ViewInspectorHelper.dpToPx(getContext(), 10f),
        padH,
        ViewInspectorHelper.dpToPx(getContext(), 24f) + this.bottomInsetPx);
  }

  @Override
  protected void onDetachedFromWindow() {
    cancelPendingSearch();
    super.onDetachedFromWindow();
  }

  void hide() {
    cancelPendingSearch();
    hideKeyboard();
    showingTree = false;
    cachedNodes = null;
    currentView = null;
    rootView = null;
    overlayView = null;
    contentContainer.removeAllViews();
    setVisibility(View.GONE);
  }

  private void cancelPendingSearch() {
    if (pendingSearchRunnable != null) {
      removeCallbacks(pendingSearchRunnable);
      pendingSearchRunnable = null;
    }
  }

  private void hideKeyboard() {
    searchInput.clearFocus();
    InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
    if (imm != null && searchInput.getWindowToken() != null) {
      imm.hideSoftInputFromWindow(searchInput.getWindowToken(), 0);
    }
  }

  void showHierarchy(View root, View overlay, View selected) {
    cancelPendingSearch();
    this.rootView = root;
    this.overlayView = overlay;
    this.currentView = selected;
    this.showingTree = true;
    this.cachedNodes = ViewInspectorHelper.collectHierarchy(root, overlay);

    titleView.setText(ViewInspectorHelper.label("视图树 (" + cachedNodes.size() + ")", "View Tree (" + cachedNodes.size() + ")"));
    headerActions.removeAllViews();
    headerActions.addView(createChipButton(ViewInspectorHelper.label("关闭", "Close"), Color.parseColor("#334155"), v -> listener.onDismiss()));

    searchInput.setVisibility(View.VISIBLE);
    suppressSearchWatcher = true;
    searchInput.setText("");
    suppressSearchWatcher = false;
    renderTree("");
    setVisibility(View.VISIBLE);
  }

  void showProperties(View root, View overlay, View target) {
    if (target == null) return;
    cancelPendingSearch();
    hideKeyboard();
    this.rootView = root;
    this.overlayView = overlay;
    this.currentView = target;
    this.showingTree = false;

    titleView.setText(ViewInspectorHelper.getSimpleClassName(target));
    headerActions.removeAllViews();

    if (target.getParent() instanceof View && target.getParent() != overlay && target != rootView) {
      View parent = (View) target.getParent();
      headerActions.addView(createChipButton(ViewInspectorHelper.label("父级", "Parent"), Color.parseColor("#1E3A5F"), v -> {
        listener.onSelectView(parent, true);
      }));
    }
    headerActions.addView(createChipButton(ViewInspectorHelper.label("复制", "Copy"), Color.parseColor("#1E293B"), v -> copyProperties(target)));
    headerActions.addView(createChipButton(ViewInspectorHelper.label("关闭", "Close"), Color.parseColor("#334155"), v -> listener.onDismiss()));

    searchInput.setVisibility(View.GONE);
    renderProperties(target);
    scrollView.scrollTo(0, 0);
    setVisibility(View.VISIBLE);
  }

  private void renderTree(String query) {
    contentContainer.removeAllViews();
    if (cachedNodes == null) return;
    Context context = getContext();
    String needle = query == null ? "" : query.trim().toLowerCase(Locale.US);
    View selectedRow = null;

    for (ViewInspectorHelper.TreeNode node : cachedNodes) {
      String className = ViewInspectorHelper.getSimpleClassName(node.view);
      String summary = ViewInspectorHelper.getShortSummary(node.view);
      if (!needle.isEmpty()) {
        String testId = ViewInspectorHelper.getTestId(node.view);
        String nativeId = ViewInspectorHelper.getNativeId(node.view);
        String hay = (className
            + " " + (summary == null ? "" : summary)
            + " " + (testId == null ? "" : testId)
            + " " + (nativeId == null ? "" : nativeId)).toLowerCase(Locale.US);
        if (!hay.contains(needle)) continue;
      }

      boolean isSelected = node.view == currentView;
      LinearLayout row = new LinearLayout(context);
      row.setOrientation(LinearLayout.HORIZONTAL);
      row.setGravity(Gravity.CENTER_VERTICAL);
      int indent = needle.isEmpty() ? Math.min(node.depth, 16) * ViewInspectorHelper.dpToPx(context, 12f) : 0;
      int padV = ViewInspectorHelper.dpToPx(context, 7f);
      int padH = ViewInspectorHelper.dpToPx(context, 8f);
      row.setPadding(padH + indent, padV, padH, padV);
      if (isSelected) {
        row.setBackground(roundedRect(context, Color.parseColor("#1D4ED8"), Color.parseColor("#60A5FA"), 8f, false));
        selectedRow = row;
      }

      TextView label = new TextView(context);
      StringBuilder sb = new StringBuilder();
      if (node.view instanceof ViewGroup) {
        sb.append("▾ ");
      } else {
        sb.append("• ");
      }
      sb.append(className);
      sb.append("  ")
          .append(ViewInspectorHelper.formatDp(context, node.view.getWidth()))
          .append("×")
          .append(ViewInspectorHelper.formatDp(context, node.view.getHeight()));
      if (!TextUtils.isEmpty(summary)) {
        sb.append("  ").append(summary);
      }
      if (node.view.getVisibility() != View.VISIBLE) {
        sb.append(" [").append(ViewInspectorHelper.visibilityName(node.view.getVisibility())).append("]");
      }
      label.setText(sb.toString());
      label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
      label.setSingleLine(true);
      label.setEllipsize(TextUtils.TruncateAt.END);
      label.setTextColor(isSelected
          ? Color.WHITE
          : (node.view.getVisibility() == View.VISIBLE ? Color.parseColor("#E2E8F0") : Color.parseColor("#64748B")));
      row.addView(label, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

      TextView inspectBtn = new TextView(context);
      inspectBtn.setText(ViewInspectorHelper.label("属性", "Info"));
      inspectBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
      inspectBtn.setTextColor(Color.parseColor("#93C5FD"));
      inspectBtn.setPadding(ViewInspectorHelper.dpToPx(context, 8f), ViewInspectorHelper.dpToPx(context, 3f),
          ViewInspectorHelper.dpToPx(context, 8f), ViewInspectorHelper.dpToPx(context, 3f));
      inspectBtn.setOnClickListener(v -> listener.onSelectView(node.view, true));
      row.addView(inspectBtn, new LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

      row.setOnClickListener(v -> {
        listener.onSelectView(node.view, false);
        listener.onDismiss();
      });

      contentContainer.addView(row, new LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    if (selectedRow != null) {
      final View targetRow = selectedRow;
      scrollView.post(() -> scrollView.smoothScrollTo(0, Math.max(0, targetRow.getTop() - ViewInspectorHelper.dpToPx(context, 80f))));
    }
  }

  private void renderProperties(View target) {
    contentContainer.removeAllViews();
    Context context = getContext();

    addSectionHeader(ViewInspectorHelper.label("实时调试", "Live Controls"));
    addLiveControls(target);

    List<ViewInspectorHelper.PropertyItem> items = ViewInspectorHelper.extractProperties(target, overlayView);
    String currentSection = null;
    for (ViewInspectorHelper.PropertyItem item : items) {
      if (!item.section.equals(currentSection)) {
        addSectionHeader(item.section);
        currentSection = item.section;
      }
      addPropertyRow(item);
    }

    if (target instanceof ViewGroup && ((ViewGroup) target).getChildCount() > 0) {
      ViewGroup group = (ViewGroup) target;
      addSectionHeader(ViewInspectorHelper.label("直接子视图 (" + group.getChildCount() + ")", "Direct Children (" + group.getChildCount() + ")"));
      for (int i = 0; i < group.getChildCount(); i++) {
        final View child = group.getChildAt(i);
        if (child == overlayView) continue;
        TextView childRow = new TextView(context);
        String summary = ViewInspectorHelper.getShortSummary(child);
        String text = i + ". " + ViewInspectorHelper.getSimpleClassName(child)
            + " (" + ViewInspectorHelper.formatDp(context, child.getWidth())
            + "×" + ViewInspectorHelper.formatDp(context, child.getHeight()) + ")"
            + (summary != null ? "  " + summary : "");
        childRow.setText(text);
        childRow.setTextColor(Color.parseColor("#93C5FD"));
        childRow.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        childRow.setPadding(ViewInspectorHelper.dpToPx(context, 8f), ViewInspectorHelper.dpToPx(context, 7f),
            ViewInspectorHelper.dpToPx(context, 8f), ViewInspectorHelper.dpToPx(context, 7f));
        childRow.setOnClickListener(v -> listener.onSelectView(child, true));
        contentContainer.addView(childRow, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
      }
    }
  }

  private void addLiveControls(View target) {
    Context context = getContext();
    LinearLayout box = new LinearLayout(context);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setBackground(roundedRect(context, Color.parseColor("#1E293B"), Color.parseColor("#334155"), 10f, false));
    int pad = ViewInspectorHelper.dpToPx(context, 12f);
    box.setPadding(pad, pad, pad, pad);

    LinearLayout visRow = new LinearLayout(context);
    visRow.setOrientation(LinearLayout.HORIZONTAL);
    visRow.setGravity(Gravity.CENTER_VERTICAL);
    TextView visLabel = new TextView(context);
    visLabel.setText("Visibility");
    visLabel.setTextColor(Color.parseColor("#94A3B8"));
    visLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
    visRow.addView(visLabel, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

    int[] visValues = new int[] { View.VISIBLE, View.INVISIBLE, View.GONE };
    String[] visNames = new String[] { "VISIBLE", "INVISIBLE", "GONE" };
    for (int i = 0; i < visValues.length; i++) {
      final int value = visValues[i];
      boolean active = target.getVisibility() == value;
      visRow.addView(createChipButton(
          visNames[i],
          active ? Color.parseColor("#2563EB") : Color.parseColor("#334155"),
          v -> {
            target.setVisibility(value);
            listener.onViewMutated(target);
            renderProperties(target);
          }));
    }
    box.addView(visRow, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

    LinearLayout alphaRow = new LinearLayout(context);
    alphaRow.setOrientation(LinearLayout.HORIZONTAL);
    alphaRow.setGravity(Gravity.CENTER_VERTICAL);
    LinearLayout.LayoutParams alphaRowParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    alphaRowParams.topMargin = ViewInspectorHelper.dpToPx(context, 10f);

    final TextView alphaLabel = new TextView(context);
    alphaLabel.setText(String.format(Locale.US, "Alpha %.2f", target.getAlpha()));
    alphaLabel.setTextColor(Color.parseColor("#94A3B8"));
    alphaLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
    alphaRow.addView(alphaLabel, new LinearLayout.LayoutParams(
        ViewInspectorHelper.dpToPx(context, 82f), LinearLayout.LayoutParams.WRAP_CONTENT));

    SeekBar seekBar = new SeekBar(context);
    seekBar.setMax(100);
    seekBar.setProgress(Math.round(target.getAlpha() * 100f));
    seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
        if (!fromUser) return;
        float alpha = progress / 100f;
        target.setAlpha(alpha);
        alphaLabel.setText(String.format(Locale.US, "Alpha %.2f", alpha));
        listener.onViewMutated(target);
      }
      @Override public void onStartTrackingTouch(SeekBar bar) {}
      @Override public void onStopTrackingTouch(SeekBar bar) {}
    });
    alphaRow.addView(seekBar, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
    box.addView(alphaRow, alphaRowParams);

    LinearLayout.LayoutParams boxParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    boxParams.bottomMargin = ViewInspectorHelper.dpToPx(context, 8f);
    contentContainer.addView(box, boxParams);
  }

  private void addSectionHeader(String title) {
    Context context = getContext();
    TextView tv = new TextView(context);
    tv.setText(title);
    tv.setTextColor(Color.parseColor("#60A5FA"));
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
    tv.setTypeface(Typeface.DEFAULT_BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.topMargin = ViewInspectorHelper.dpToPx(context, 10f);
    params.bottomMargin = ViewInspectorHelper.dpToPx(context, 6f);
    contentContainer.addView(tv, params);
  }

  private void addPropertyRow(ViewInspectorHelper.PropertyItem item) {
    Context context = getContext();
    LinearLayout row = new LinearLayout(context);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    int padV = ViewInspectorHelper.dpToPx(context, 5f);
    row.setPadding(0, padV, 0, padV);

    TextView keyView = new TextView(context);
    keyView.setText(item.key);
    keyView.setTextColor(Color.parseColor("#94A3B8"));
    keyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
    row.addView(keyView, new LinearLayout.LayoutParams(
        ViewInspectorHelper.dpToPx(context, 128f), LinearLayout.LayoutParams.WRAP_CONTENT));

    if (item.colorPreview != null) {
      View swatch = new View(context);
      swatch.setBackground(roundedRect(context, item.colorPreview, Color.parseColor("#94A3B8"), 4f, false));
      LinearLayout.LayoutParams swatchParams = new LinearLayout.LayoutParams(
          ViewInspectorHelper.dpToPx(context, 14f), ViewInspectorHelper.dpToPx(context, 14f));
      swatchParams.rightMargin = ViewInspectorHelper.dpToPx(context, 6f);
      row.addView(swatch, swatchParams);
    }

    TextView valueView = new TextView(context);
    valueView.setText(item.value);
    valueView.setTextColor(Color.parseColor("#F1F5F9"));
    valueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
    valueView.setTextIsSelectable(true);
    row.addView(valueView, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

    contentContainer.addView(row, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
  }

  private void copyProperties(View target) {
    Context context = getContext();
    ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard != null) {
      String text = ViewInspectorHelper.formatPropertiesForCopy(target, overlayView);
      clipboard.setPrimaryClip(ClipData.newPlainText("ViewInspector", text));
      Toast.makeText(context, ViewInspectorHelper.label("已复制视图属性", "View properties copied"), Toast.LENGTH_SHORT).show();
    }
  }

  private TextView createChipButton(String text, int bgColor, OnClickListener onClick) {
    Context context = getContext();
    TextView btn = new TextView(context);
    btn.setText(text);
    btn.setTextColor(Color.WHITE);
    btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
    btn.setBackground(roundedRect(context, bgColor, Color.TRANSPARENT, 8f, false));
    int padH = ViewInspectorHelper.dpToPx(context, 10f);
    int padV = ViewInspectorHelper.dpToPx(context, 5f);
    btn.setPadding(padH, padV, padH, padV);
    btn.setOnClickListener(onClick);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.leftMargin = ViewInspectorHelper.dpToPx(context, 6f);
    btn.setLayoutParams(params);
    return btn;
  }

  private static GradientDrawable roundedRect(Context context, int fill, int stroke, float radiusDp, boolean topOnly) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fill);
    float r = ViewInspectorHelper.dpToPx(context, radiusDp);
    if (topOnly) {
      drawable.setCornerRadii(new float[] { r, r, r, r, 0f, 0f, 0f, 0f });
    } else {
      drawable.setCornerRadius(r);
    }
    if (stroke != Color.TRANSPARENT) {
      drawable.setStroke(Math.max(1, ViewInspectorHelper.dpToPx(context, 1f)), stroke);
    }
    return drawable;
  }
}
