package com.reactnativedebugtoolkit;

import android.content.Context;
import android.content.res.Resources;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

final class ViewInspectorHelper {
  static final class TreeNode {
    final View view;
    final int depth;

    TreeNode(View view, int depth) {
      this.view = view;
      this.depth = depth;
    }
  }

  static final class PropertyItem {
    final String section;
    final String key;
    final String value;
    final Integer colorPreview;

    PropertyItem(String section, String key, String value, Integer colorPreview) {
      this.section = section;
      this.key = key;
      this.value = value;
      this.colorPreview = colorPreview;
    }
  }

  private static int cachedTestIdTagKey = Integer.MIN_VALUE;
  private static int cachedNativeIdTagKey = Integer.MIN_VALUE;
  private static boolean bgStyleApplicatorResolved = false;
  private static Method bgStyleApplicatorGetColor;
  private static boolean reactZIndexedResolved = false;
  private static Class<?> reactZIndexedClass;
  private static Method reactZIndexedGetMappedIndex;

  private ViewInspectorHelper() {}

  static boolean isChinese() {
    Locale locale = Locale.getDefault();
    return locale != null && "zh".equalsIgnoreCase(locale.getLanguage());
  }

  static String label(String zh, String en) {
    return isChinese() ? zh : en;
  }

  static float density(Context context) {
    float density = context.getResources().getDisplayMetrics().density;
    return density > 0f ? density : 1f;
  }

  static float scaledDensity(Context context) {
    float sd = context.getResources().getDisplayMetrics().scaledDensity;
    return sd > 0f ? sd : density(context);
  }

  static int dpToPx(Context context, float dp) {
    return Math.round(dp * density(context));
  }

  static float pxToDp(Context context, float px) {
    return px / density(context);
  }

  static String formatDp(Context context, float px) {
    float dp = pxToDp(context, px);
    float rounded = Math.round(dp * 10f) / 10f;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05f) {
      return Math.round(rounded) + "dp";
    }
    return String.format(Locale.US, "%.1fdp", rounded);
  }

  static String formatNumber(float value) {
    float rounded = Math.round(value * 10f) / 10f;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05f) {
      return String.valueOf(Math.round(rounded));
    }
    return String.format(Locale.US, "%.1f", rounded);
  }

  static String getSimpleClassName(View view) {
    String simple = view.getClass().getSimpleName();
    return TextUtils.isEmpty(simple) ? view.getClass().getName() : simple;
  }

  static String getTestId(View view) {
    try {
      if (cachedTestIdTagKey == Integer.MIN_VALUE) {
        Context context = view.getContext();
        cachedTestIdTagKey = context.getResources().getIdentifier("react_test_id", "id", context.getPackageName());
      }
      if (cachedTestIdTagKey != 0) {
        Object tag = view.getTag(cachedTestIdTagKey);
        if (tag instanceof CharSequence && !TextUtils.isEmpty((CharSequence) tag)) {
          return tag.toString();
        }
      }
    } catch (RuntimeException ignored) {
      // Fall through if host resources do not define the React Native testID tag key.
    }
    return null;
  }

  static String getNativeId(View view) {
    try {
      if (cachedNativeIdTagKey == Integer.MIN_VALUE) {
        Context context = view.getContext();
        cachedNativeIdTagKey = context.getResources().getIdentifier("view_tag_native_id", "id", context.getPackageName());
      }
      if (cachedNativeIdTagKey != 0) {
        Object tag = view.getTag(cachedNativeIdTagKey);
        if (tag instanceof CharSequence && !TextUtils.isEmpty((CharSequence) tag)) {
          return tag.toString();
        }
      }
    } catch (RuntimeException ignored) {
      // Fall through if host resources do not define the React Native tag key.
    }
    Object rawTag = view.getTag();
    if (rawTag instanceof String && !TextUtils.isEmpty((String) rawTag)) {
      return (String) rawTag;
    }
    return null;
  }

  static String getResourceIdName(View view) {
    int id = view.getId();
    if (id == View.NO_ID) return null;
    try {
      return "@id/" + view.getResources().getResourceEntryName(id);
    } catch (Resources.NotFoundException ignored) {
      return "#" + Integer.toHexString(id);
    }
  }

  static String getShortSummary(View view) {
    String testId = getTestId(view);
    if (!TextUtils.isEmpty(testId)) {
      return "#" + testId;
    }
    String nativeId = getNativeId(view);
    if (!TextUtils.isEmpty(nativeId)) {
      return "#" + nativeId;
    }
    if (view instanceof TextView) {
      CharSequence text = ((TextView) view).getText();
      if (!TextUtils.isEmpty(text)) {
        String singleLine = text.toString().replace('\n', ' ').trim();
        if (singleLine.length() > 28) singleLine = singleLine.substring(0, 28) + "…";
        return "\"" + singleLine + "\"";
      }
    }
    CharSequence desc = view.getContentDescription();
    if (!TextUtils.isEmpty(desc)) {
      String text = desc.toString().replace('\n', ' ').trim();
      if (text.length() > 24) text = text.substring(0, 24) + "…";
      return "[" + text + "]";
    }
    return getResourceIdName(view);
  }

  static Rect getRectInOverlay(View view, View overlay) {
    int[] viewLoc = new int[2];
    int[] overlayLoc = new int[2];
    view.getLocationOnScreen(viewLoc);
    overlay.getLocationOnScreen(overlayLoc);
    int left = viewLoc[0] - overlayLoc[0];
    int top = viewLoc[1] - overlayLoc[1];
    int width = Math.round(view.getWidth() * Math.abs(view.getScaleX()));
    int height = Math.round(view.getHeight() * Math.abs(view.getScaleY()));
    return new Rect(left, top, left + width, top + height);
  }

  static boolean isInspectable(View view, View overlay) {
    if (view == null || view == overlay) return false;
    if (view.getVisibility() != View.VISIBLE) return false;
    if (view.getAlpha() <= 0.001f) return false;
    return view.getWidth() > 0 && view.getHeight() > 0;
  }

  static List<View> hitTestStack(View root, View overlay, float overlayX, float overlayY) {
    List<View> hits = new ArrayList<>();
    collectHits(root, overlay, overlayX, overlayY, hits);
    return hits;
  }

  private static void collectHits(View view, View overlay, float x, float y, List<View> hits) {
    if (!isInspectable(view, overlay)) return;
    Rect rect = getRectInOverlay(view, overlay);
    boolean inside = rect.contains(Math.round(x), Math.round(y));
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      boolean clip = group.getClipChildren();
      if (inside || !clip) {
        List<View> ordered = getChildrenInDrawOrder(group);
        for (int i = ordered.size() - 1; i >= 0; i--) {
          collectHits(ordered.get(i), overlay, x, y, hits);
        }
      }
    }
    if (inside && view.getId() != android.R.id.statusBarBackground
        && view.getId() != android.R.id.navigationBarBackground) {
      hits.add(view);
    }
  }

  private static int getReactZIndexMappedChildIndex(ViewGroup group, int index) {
    if (!reactZIndexedResolved) {
      reactZIndexedResolved = true;
      try {
        reactZIndexedClass = Class.forName("com.facebook.react.uimanager.ReactZIndexedViewGroup");
        reactZIndexedGetMappedIndex = reactZIndexedClass.getMethod("getZIndexMappedChildIndex", int.class);
      } catch (ReflectiveOperationException ignored) {
        reactZIndexedClass = null;
        reactZIndexedGetMappedIndex = null;
      }
    }
    if (reactZIndexedClass != null && reactZIndexedGetMappedIndex != null && reactZIndexedClass.isInstance(group)) {
      try {
        Object mapped = reactZIndexedGetMappedIndex.invoke(group, index);
        if (mapped instanceof Integer) {
          return (Integer) mapped;
        }
      } catch (ReflectiveOperationException | RuntimeException ignored) {
        return -1;
      }
    }
    return -1;
  }

  private static List<View> getChildrenInDrawOrder(ViewGroup group) {
    int count = group.getChildCount();
    List<View> children = new ArrayList<>(count);
    boolean hasMixedZ = false;
    float firstZ = 0f;
    for (int i = 0; i < count; i++) {
      int childIndex = i;
      int reactMapped = getReactZIndexMappedChildIndex(group, i);
      if (reactMapped >= 0 && reactMapped < count) {
        childIndex = reactMapped;
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        try {
          int mapped = group.getChildDrawingOrder(i);
          if (mapped >= 0 && mapped < count) {
            childIndex = mapped;
          }
        } catch (RuntimeException ignored) {
          // Fall back to natural child order if a custom ViewGroup throws.
        }
      }
      View child = group.getChildAt(childIndex);
      if (child != null) {
        float z = child.getZ();
        if (children.isEmpty()) {
          firstZ = z;
        } else if (z != firstZ) {
          hasMixedZ = true;
        }
        children.add(child);
      }
    }
    if (hasMixedZ) {
      Collections.sort(children, (a, b) -> Float.compare(a.getZ(), b.getZ()));
    }
    return children;
  }

  static List<TreeNode> collectHierarchy(View root, View overlay) {
    List<TreeNode> nodes = new ArrayList<>();
    walkHierarchy(root, overlay, 0, nodes);
    return nodes;
  }

  private static void walkHierarchy(View view, View overlay, int depth, List<TreeNode> out) {
    if (view == null || view == overlay) return;
    out.add(new TreeNode(view, depth));
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) {
        walkHierarchy(group.getChildAt(i), overlay, depth + 1, out);
      }
    }
  }

  static Integer extractBackgroundColor(View view) {
    Drawable bg = view.getBackground();
    if (bg == null) return null;
    if (bg instanceof ColorDrawable) {
      return ((ColorDrawable) bg).getColor();
    }
    Integer rnColor = extractReactNativeBackgroundColor(view);
    if (rnColor != null) {
      return rnColor;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && bg instanceof GradientDrawable) {
      android.content.res.ColorStateList colorStateList = ((GradientDrawable) bg).getColor();
      if (colorStateList != null) {
        return colorStateList.getDefaultColor();
      }
    }
    try {
      Method getColor = bg.getClass().getMethod("getColor");
      Object result = getColor.invoke(bg);
      if (result instanceof Integer) {
        return (Integer) result;
      }
    } catch (ReflectiveOperationException ignored) {
      // Non-color drawables do not expose getColor().
    }
    return null;
  }

  private static Integer extractReactNativeBackgroundColor(View view) {
    if (!bgStyleApplicatorResolved) {
      bgStyleApplicatorResolved = true;
      try {
        Class<?> applicator = Class.forName("com.facebook.react.uimanager.BackgroundStyleApplicator");
        bgStyleApplicatorGetColor = applicator.getMethod("getBackgroundColor", View.class);
      } catch (ReflectiveOperationException ignored) {
        bgStyleApplicatorGetColor = null;
      }
    }
    if (bgStyleApplicatorGetColor == null) return null;
    try {
      Object result = bgStyleApplicatorGetColor.invoke(null, view);
      if (result instanceof Integer) {
        return (Integer) result;
      }
    } catch (ReflectiveOperationException | RuntimeException ignored) {
      // Ignore if host RN version differs.
    }
    return null;
  }

  static String colorToHex(int color) {
    return String.format(Locale.US, "#%08X", color);
  }

  static String visibilityName(int visibility) {
    if (visibility == View.VISIBLE) return "VISIBLE";
    if (visibility == View.INVISIBLE) return "INVISIBLE";
    return "GONE";
  }

  static List<PropertyItem> extractProperties(View view, View overlay) {
    List<PropertyItem> items = new ArrayList<>();
    Context context = view.getContext();
    String identity = label("基本信息", "Identity");
    String layout = label("布局与盒模型", "Layout");
    String appearance = label("外观与状态", "Appearance");

    items.add(new PropertyItem(identity, label("类名", "Class"), getSimpleClassName(view), null));
    items.add(new PropertyItem(identity, label("完整类名", "Full Class"), view.getClass().getName(), null));
    String testId = getTestId(view);
    if (!TextUtils.isEmpty(testId)) {
      items.add(new PropertyItem(identity, "testID", testId, null));
    }
    String nativeId = getNativeId(view);
    if (!TextUtils.isEmpty(nativeId) && !nativeId.equals(testId)) {
      items.add(new PropertyItem(identity, "nativeID", nativeId, null));
    }
    String resId = getResourceIdName(view);
    if (!TextUtils.isEmpty(resId)) {
      items.add(new PropertyItem(identity, "View ID", resId, null));
    }
    CharSequence contentDesc = view.getContentDescription();
    if (!TextUtils.isEmpty(contentDesc)) {
      items.add(new PropertyItem(identity, "ContentDesc", contentDesc.toString(), null));
    }
    if (view instanceof ViewGroup) {
      items.add(new PropertyItem(identity, label("子视图数量", "Children"), String.valueOf(((ViewGroup) view).getChildCount()), null));
    }

    Rect rect = getRectInOverlay(view, overlay);
    items.add(new PropertyItem(
        layout,
        label("尺寸 (dp)", "Size (dp)"),
        formatDp(context, rect.width()) + " × " + formatDp(context, rect.height()),
        null));
    items.add(new PropertyItem(
        layout,
        label("尺寸 (px)", "Size (px)"),
        rect.width() + "px × " + rect.height() + "px",
        null));
    items.add(new PropertyItem(
        layout,
        label("屏幕位置 (dp)", "Position (dp)"),
        "x=" + formatDp(context, rect.left) + ", y=" + formatDp(context, rect.top),
        null));
    items.add(new PropertyItem(
        layout,
        label("边界 (dp)", "Bounds (dp)"),
        "L=" + formatDp(context, rect.left)
            + "  T=" + formatDp(context, rect.top)
            + "  R=" + formatDp(context, rect.right)
            + "  B=" + formatDp(context, rect.bottom),
        null));
    items.add(new PropertyItem(
        layout,
        "Padding (T/R/B/L)",
        formatDp(context, view.getPaddingTop()) + " / "
            + formatDp(context, view.getPaddingRight()) + " / "
            + formatDp(context, view.getPaddingBottom()) + " / "
            + formatDp(context, view.getPaddingLeft()),
        null));

    ViewGroup.LayoutParams lp = view.getLayoutParams();
    if (lp instanceof ViewGroup.MarginLayoutParams) {
      ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
      items.add(new PropertyItem(
          layout,
          "Margin (T/R/B/L)",
          formatDp(context, mlp.topMargin) + " / "
              + formatDp(context, mlp.rightMargin) + " / "
              + formatDp(context, mlp.bottomMargin) + " / "
              + formatDp(context, mlp.leftMargin),
          null));
    }
    if (view.getTranslationX() != 0f || view.getTranslationY() != 0f) {
      items.add(new PropertyItem(
          layout,
          "Translation",
          "tx=" + formatDp(context, view.getTranslationX()) + ", ty=" + formatDp(context, view.getTranslationY()),
          null));
    }
    if (view.getScaleX() != 1f || view.getScaleY() != 1f) {
      items.add(new PropertyItem(
          layout,
          "Scale",
          "sx=" + formatNumber(view.getScaleX()) + ", sy=" + formatNumber(view.getScaleY()),
          null));
    }
    if (view.getElevation() != 0f) {
      items.add(new PropertyItem(layout, "Elevation", formatDp(context, view.getElevation()), null));
    }

    items.add(new PropertyItem(appearance, "Visibility", visibilityName(view.getVisibility()), null));
    items.add(new PropertyItem(appearance, "Alpha", String.format(Locale.US, "%.2f", view.getAlpha()), null));
    Integer bgColor = extractBackgroundColor(view);
    if (bgColor != null) {
      items.add(new PropertyItem(appearance, label("背景色", "Background"), colorToHex(bgColor), bgColor));
    } else if (view.getBackground() != null) {
      items.add(new PropertyItem(appearance, label("背景 Drawable", "Background"), view.getBackground().getClass().getSimpleName(), null));
    }
    items.add(new PropertyItem(
        appearance,
        label("交互标志", "Flags"),
        "clickable=" + view.isClickable() + ", focusable=" + view.isFocusable() + ", enabled=" + view.isEnabled(),
        null));
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      items.add(new PropertyItem(
          appearance,
          "Clipping",
          "clipChildren=" + group.getClipChildren() + ", clipToPadding=" + group.getClipToPadding(),
          null));
    }

    if (view instanceof TextView) {
      TextView tv = (TextView) view;
      String textSection = label("文本属性", "Text");
      CharSequence text = tv.getText();
      items.add(new PropertyItem(textSection, label("内容", "Text"), text == null ? "" : text.toString(), null));
      float sp = tv.getTextSize() / scaledDensity(context);
      items.add(new PropertyItem(textSection, label("字号", "TextSize"), formatNumber(sp) + "sp (" + formatDp(context, tv.getTextSize()) + ")", null));
      int textColor = tv.getCurrentTextColor();
      items.add(new PropertyItem(textSection, label("文字颜色", "TextColor"), colorToHex(textColor), textColor));
      items.add(new PropertyItem(textSection, label("行数", "LineCount"), String.valueOf(tv.getLineCount()), null));
    }

    if (view instanceof ImageView) {
      ImageView iv = (ImageView) view;
      String imageSection = label("图片属性", "Image");
      if (iv.getScaleType() != null) {
        items.add(new PropertyItem(imageSection, "ScaleType", iv.getScaleType().name(), null));
      }
      Drawable drawable = iv.getDrawable();
      if (drawable != null) {
        items.add(new PropertyItem(
            imageSection,
            "Drawable",
            drawable.getClass().getSimpleName()
                + " (" + drawable.getIntrinsicWidth() + "×" + drawable.getIntrinsicHeight() + "px)",
            null));
      }
    }

    return items;
  }

  static String formatPropertiesForCopy(View view, View overlay) {
    StringBuilder sb = new StringBuilder();
    List<PropertyItem> items = extractProperties(view, overlay);
    String lastSection = null;
    for (PropertyItem item : items) {
      if (!item.section.equals(lastSection)) {
        if (sb.length() > 0) sb.append('\n');
        sb.append('[').append(item.section).append("]\n");
        lastSection = item.section;
      }
      sb.append(item.key).append(": ").append(item.value).append('\n');
    }
    return sb.toString().trim();
  }
}
