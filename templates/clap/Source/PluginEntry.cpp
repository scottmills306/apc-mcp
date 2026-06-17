#include <clap/entry.h>
#include <clap/clap.h>
#include "PluginProcessor.h"

static const clap_plugin_descriptor s_descriptor = {
    .clap_version = CLAP_VERSION,
    .id = "com.{{VENDOR}}.{{PLUGIN_ID}}",
    .name = "{{PLUGIN_DISPLAY_NAME}}",
    .vendor = "{{VENDOR}}",
    .url = "https://{{VENDOR}}.com/{{PLUGIN_ID}}",
    .manual_url = "",
    .support_url = "",
    .version = "1.0.0",
    .description = "{{PLUGIN_DESCRIPTION}}",
    .features = (const char *[]){CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, nullptr},
};

static const clap_plugin *create_plugin(const clap_host *host) {
    auto *p = new {{PLUGIN_CLASS_NAME}}(host, &s_descriptor);
    return p->clapPlugin();
}

const clap_plugin_entry entry = {
    .clap_version = CLAP_VERSION_INIT,
    .init = [](const char *) -> bool { return true; },
    .deinit = []() {},
    .get_plugin_count = []() -> uint32_t { return 1; },
    .get_plugin_descriptor = [](uint32_t index) -> const clap_plugin_descriptor * {
        return index == 0 ? &s_descriptor : nullptr;
    },
    .create_plugin = [](const clap_host *host, const char *plugin_id) -> const clap_plugin * {
        if (!plugin_id || strcmp(plugin_id, s_descriptor.id) != 0) return nullptr;
        return create_plugin(host);
    },
};
