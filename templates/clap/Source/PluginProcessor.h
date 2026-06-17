#pragma once
#include <clap/plugin.h>
#include <clap/process.h>
#include <clap/audio-buffer.h>

class {{PLUGIN_CLASS_NAME}} {
public:
    {{PLUGIN_CLASS_NAME}}(const clap_host *host, const clap_plugin_descriptor *desc);
    ~{{PLUGIN_CLASS_NAME}}();

    const clap_plugin *clapPlugin() const { return &m_plugin; }

private:
    // CLAP plugin struct — implements clap_plugin vtable
    static bool activate(const clap_plugin *plugin, double sample_rate, uint32_t min_frames, uint32_t max_frames);
    static void deactivate(const clap_plugin *plugin);
    static bool start_processing(const clap_plugin *plugin);
    static void stop_processing(const clap_plugin *plugin);
    static clap_process_status process(const clap_plugin *plugin, const clap_process *process);

    clap_plugin m_plugin;
    const clap_host *m_host;
    const clap_plugin_descriptor *m_desc;
    double m_sampleRate = 48000.0;
    float m_gain = 1.0f;
};
