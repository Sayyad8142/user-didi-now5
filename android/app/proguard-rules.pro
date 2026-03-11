# Razorpay SDK — keep payment classes
-keepclassmembers class com.razorpay.** { *; }
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepattributes *Annotation*

# Keep plugin registration
-keep class com.didisnow.app.RazorpayPlugin { *; }
