#include "PluginProcessor.h"
#include <cstring>
#include <cmath>

{{PLUGIN_CLASS_NAME}}::{{PLUGIN_CLASS_NAME}}(const clap_host *host, const clap_plugin_descriptor *desc)
    : m_host(host), m_desc(desc) {
    m_plugin.desc = desc;
    m_plugin.plugin_data = this;
    m_plugin.init = [](const clap_plugin *) -> bool { return true; };
    m_plugin.destroy = [](const clap_plugin *p) { delete static_cast<{{PLUGIN_CLASS_NAME}} *>(p->plugin_data); };
    m_plugin.activate = activate;
    m_plugin.deactivate = deactivate;
    m_plugin.start_processing = start_processing;
    m_plugin.stop_processing = stop_processing;
    m_plugin.process = process;
    m_plugin.get_extension = [](const clap_plugin *, const char *) -> const void * { return nullptr; };
    m_plugin.on_main_thread = [](const clap_plugin *) {};
}

{{PLUGIN_CLASS_NAME}}::~{{PLUGIN_CLASS_NAME}}() = default;

bool {{PLUGIN_CLASS_NAME}}::activate(const clap_plugin *plugin, double sample_rate, uint32_t, uint32_t) {
    auto *self = static_cast<{{PLUGIN_CLASS_NAME}} *>(plugin->plugin_data);
    self->m_sampleRate = sample_rate;
    return true;
}

void {{PLUGIN_CLASS_NAME}}::deactivate(const clap_plugin *) {}

bool {{PLUGIN_CLASS_NAME}}::start_processing(const clap_plugin *) { return true; }
void {{PLUGIN_CLASS_NAME}}::stop_processing(const clap_plugin *) {}

clap_process_status {{PLUGIN_CLASS_NAME}}::process(const clap_plugin *plugin, const clap_process *process) {
    auto *self = static_cast<{{PLUGIN_CLASS_NAME}} *>(plugin->plugin_data);
    const uint32_t n = process->frames;
    const float *inL = process->audio_inputs[0].data32[0];
    const float *inR = process->audio_inputs[0].data32[1];
    float *outL = process->audio_outputs[0].data32[0];
    float *outR = process->audio_outputs[0].data32[1];

    for (uint32_t i = 0; i < n; ++i) {
        outL[i] = inL[i] * self->m_gain;
        outR[i] = inR[i] * self->m_gain;
    }
    return CLAP_PROCESS_CONTINUE;
}
