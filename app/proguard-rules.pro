# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Gson specific rules
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep data classes
-keep class com.example.sensorusbserial.SensorData { *; }
-keep class com.example.sensorusbserial.AccelerometerData { *; }
-keep class com.example.sensorusbserial.GyroscopeData { *; }
-keep class com.example.sensorusbserial.LightData { *; }
-keep class com.example.sensorusbserial.GpsData { *; }
